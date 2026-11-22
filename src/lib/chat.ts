// Nexconn Chat SDK client (loaded lazily when the chat panel opens). One-to-one direct channels between a
// traveller and the agent desk: connect with a server-issued token, load history, send text and offer cards,
// typing status both ways.
import {
  AreaCode,
  BaseChannel,
  ChannelHandler,
  DirectChannel,
  DirectChannelIdentifier,
  LogLevel,
  MessageHandler,
  NCEngine,
  SendTextMessageParams,
  type Message,
} from '@nexconn/chat'

export interface SharedOffer {
  title: string
  priceINR: number | null
  url: string | null
  image: string | null
  place?: string
}
export interface ChatMsg {
  id: string
  from: string
  mine: boolean
  text: string
  time: number
  offer?: SharedOffer
}
export interface ChatEvents {
  onMessages(m: ChatMsg[], peer: string): void
  onTyping(peer: string): void
}
export interface ChatSession {
  me: string
  agentId: string
  history(peer: string): Promise<ChatMsg[]>
  send(peer: string, text: string, offer?: SharedOffer): Promise<ChatMsg | null>
  typing(peer: string): void
}

let started: Promise<ChatSession> | null = null
const ID_KEY = 'og-chat-id'

function browserId() {
  let id = localStorage.getItem(ID_KEY)
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    localStorage.setItem(ID_KEY, id)
  }
  return id
}

export function startChat(role: 'traveller' | 'agent', ev: ChatEvents): Promise<ChatSession> {
  started ??= open(role, ev).catch((e) => {
    started = null
    throw e
  })
  return started
}

async function open(role: 'traveller' | 'agent', ev: ChatEvents): Promise<ChatSession> {
  const res = await fetch('/api/chat-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role, id: browserId() }),
  })
  const t = (await res.json()) as { configured?: boolean; appKey?: string; token?: string; agentId?: string; error?: string }
  if (!t.configured || !t.appKey || !t.token) throw new Error(t.error ?? 'Chat is not configured')

  NCEngine.initialize({ appKey: t.appKey, areaCode: AreaCode.SG, logLevel: LogLevel.ERROR })
  const conn = await NCEngine.connect({ token: t.token })
  if (!conn.isOk || !conn.data) throw new Error(`Could not connect to Nexconn (${conn.code})`)
  const me = conn.data.userId

  const toMsg = (m: Message): ChatMsg => {
    const c = m.content as { text?: string; extra?: string }
    let offer: SharedOffer | undefined
    try {
      offer = c.extra ? (JSON.parse(c.extra) as { offer?: SharedOffer }).offer : undefined
    } catch {
      offer = undefined
    }
    return { id: m.messageId || String(m.clientId), from: m.senderUserId, mine: m.senderUserId === me, text: c.text ?? '', time: m.sentTime, offer }
  }

  NCEngine.addMessageHandler(
    'offergraph',
    new MessageHandler({
      onMessageReceived(e) {
        const direct = e.messages.filter((m) => m.messageType === 'RC:TxtMsg')
        if (direct.length) ev.onMessages(direct.map(toMsg), direct[0].channelIdentifier.channelId)
      },
    }),
  )
  NCEngine.addChannelHandler(
    'offergraph',
    new ChannelHandler({
      onTypingStatusChanged(e) {
        if (e.userTypingStatus.some((u) => u.userId !== me)) ev.onTyping(e.channelIdentifier.channelId)
      },
    }),
  )

  let lastTyping = 0
  return {
    me,
    agentId: t.agentId ?? 'og-agent',
    async history(peer) {
      const q = BaseChannel.createMessagesQuery({ channelIdentifier: new DirectChannelIdentifier(peer), isAscending: false, pageSize: 30 })
      const r = await q.loadNextPage()
      if (!r.isOk || !r.data) return []
      return r.data.data.filter((m) => m.messageType === 'RC:TxtMsg').map(toMsg).sort((a, b) => a.time - b.time)
    },
    async send(peer, text, offer) {
      const r = await new DirectChannel(peer).sendMessage(new SendTextMessageParams({ text, extra: offer ? JSON.stringify({ offer }) : undefined }))
      return r.isOk && r.data ? toMsg(r.data) : null
    },
    typing(peer) {
      if (Date.now() - lastTyping < 3000) return
      lastTyping = Date.now()
      void new DirectChannel(peer).sendTypingStatus('RC:TxtMsg')
    },
  }
}
