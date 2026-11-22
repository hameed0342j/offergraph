// "Ask a travel agent": a one-to-one Nexconn chat between the traveller and the agent desk. Open the site with
// ?agent to act as the agent desk (replies go to the traveller who wrote last).
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMsg, ChatSession, SharedOffer } from '../lib/chat'
import './chat.css'

export const AGENT_MODE = new URLSearchParams(location.search).has('agent')
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const hhmm = (t: number) => new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

export function shareOffer(offer: SharedOffer) {
  window.dispatchEvent(new CustomEvent('og:chat-share', { detail: offer }))
}

export function ChatPanel() {
  const [open, setOpen] = useState(AGENT_MODE)
  const [status, setStatus] = useState<'idle' | 'connecting' | 'ready' | 'error'>('idle')
  const [error, setError] = useState('')
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [peer, setPeer] = useState<string | null>(null)
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const session = useRef<ChatSession | null>(null)
  const peerRef = useRef<string | null>(null)
  const pending = useRef<SharedOffer | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const typingTimer = useRef<number | undefined>(undefined)
  const [call, setCall] = useState<'idle' | 'calling' | 'incoming' | 'active'>('idle')
  const [callErr, setCallErr] = useState('')
  const callId = useRef<string | undefined>(undefined)
  const localV = useRef<HTMLVideoElement>(null)
  const remoteV = useRef<HTMLVideoElement>(null)

  const startCall = async () => {
    const p = peerRef.current
    if (!p || !localV.current || !remoteV.current) return
    setCallErr('')
    setCall('calling')
    try {
      const { startVideoCall } = await import('../lib/call')
      callId.current = await startVideoCall(p, localV.current, remoteV.current)
    } catch (e) {
      setCallErr(e instanceof Error ? e.message : 'Call failed')
      setCall('idle')
    }
  }
  const acceptCall = async () => {
    if (!callId.current || !localV.current || !remoteV.current) return
    const { acceptVideoCall } = await import('../lib/call')
    await acceptVideoCall(callId.current, peerRef.current ?? '', localV.current, remoteV.current).catch(() => setCall('idle'))
  }
  const hangUp = async () => {
    const { endVideoCall } = await import('../lib/call')
    await endVideoCall(callId.current).catch(() => undefined)
    callId.current = undefined
    setCall('idle')
  }

  const add = useCallback((m: ChatMsg[]) => setMsgs((prev) => [...prev, ...m.filter((x) => !prev.some((p) => p.id === x.id))].sort((a, b) => a.time - b.time)), [])

  const switchPeer = useCallback(async (p: string) => {
    peerRef.current = p
    setPeer(p)
    const s = session.current
    if (s) setMsgs(await s.history(p))
  }, [])

  const send = useCallback(async (text: string, offer?: SharedOffer) => {
    const s = session.current
    const p = peerRef.current
    if (!s || !p || !text.trim()) return
    const m = await s.send(p, text.trim(), offer)
    if (m) add([m])
  }, [add])

  const connect = useCallback(async () => {
    if (session.current || status === 'connecting') return
    setStatus('connecting')
    try {
      const { startChat } = await import('../lib/chat')
      const s = await startChat(AGENT_MODE ? 'agent' : 'traveller', {
        onMessages(m, from) {
          if (AGENT_MODE && peerRef.current !== from) void switchPeer(from)
          else add(m)
          setTyping(false)
        },
        onTyping(from) {
          if (from !== peerRef.current) return
          setTyping(true)
          clearTimeout(typingTimer.current)
          typingTimer.current = window.setTimeout(() => setTyping(false), 4000)
        },
        call: {
          onIncoming(id, from) {
            callId.current = id
            if (AGENT_MODE && from && peerRef.current !== from) void switchPeer(from)
            setCall('incoming')
          },
          onConnected() {
            setCall('active')
          },
          onEnded() {
            callId.current = undefined
            setCall('idle')
          },
        },
      })
      session.current = s
      setStatus('ready')
      if (!AGENT_MODE) await switchPeer(s.agentId)
      if (pending.current) {
        const o = pending.current
        pending.current = null
        await send(`Can you check this one for us?`, o)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect')
      setStatus('error')
    }
  }, [add, send, status, switchPeer])

  useEffect(() => {
    if (open) void connect()
  }, [open, connect])

  useEffect(() => {
    const onShare = (e: Event) => {
      const offer = (e as CustomEvent<SharedOffer>).detail
      setOpen(true)
      if (session.current && peerRef.current) void send('Can you check this one for us?', offer)
      else pending.current = offer
    }
    window.addEventListener('og:chat-share', onShare)
    return () => window.removeEventListener('og:chat-share', onShare)
  }, [send])

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, typing])

  if (!open)
    return (
      <button className="chat-fab" onClick={() => setOpen(true)}>
        <span className="chat-dot" />
        Ask a travel agent
      </button>
    )

  const who = AGENT_MODE ? (peer ? `Traveller ${peer.slice(2, 6)}` : 'Waiting for a traveller') : 'OfferGraph agent desk'
  return (
    <section className="chat" aria-label={AGENT_MODE ? 'Agent desk chat' : 'Chat with a travel agent'}>
      <header className="chat-head">
        <div>
          <span className="chat-kicker">{AGENT_MODE ? 'Agent desk' : 'Ask a travel agent'}</span>
          <b>{who}</b>
        </div>
        <span className={`chat-state ${status}`}>{status === 'ready' ? 'Connected' : status === 'connecting' ? 'Connecting' : status === 'error' ? 'Offline' : ''}</span>
        {status === 'ready' && peer && call === 'idle' && (
          <button className="chat-call" onClick={() => void startCall()} title="Start a video call (Nexconn Call SDK)">
            Video call
          </button>
        )}
        {!AGENT_MODE && (
          <button className="chat-x" onClick={() => setOpen(false)} aria-label="Close chat">
            ×
          </button>
        )}
      </header>
      <div className={`chat-video ${call === 'idle' ? 'hidden' : ''}`}>
        <video ref={remoteV} autoPlay playsInline className="chat-remote" />
        <video ref={localV} autoPlay playsInline muted className="chat-local" />
        <div className="chat-video-bar">
          <span>{call === 'calling' ? 'Calling…' : call === 'incoming' ? 'Incoming video call' : 'On call'}</span>
          {call === 'incoming' && <button onClick={() => void acceptCall()}>Accept</button>}
          <button className="end" onClick={() => void hangUp()}>
            {call === 'incoming' ? 'Decline' : 'End'}
          </button>
        </div>
      </div>
      {callErr && <p className="chat-note">{callErr}</p>}
      <div className="chat-list" ref={list}>
        {status === 'error' && <p className="chat-note">{error}</p>}
        {status === 'ready' && !msgs.length && (
          <p className="chat-note">
            {AGENT_MODE ? 'Messages from travellers on the Live India page appear here.' : 'Ask about any listing, or press "Ask agent" on a card to send it here. An agent replies in this chat.'}
          </p>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`chat-msg ${m.mine ? 'mine' : 'theirs'}`}>
            {m.offer && (
              <a className="chat-offer" href={m.offer.url ?? undefined} target="_blank" rel="noopener noreferrer sponsored">
                {m.offer.image && <img src={m.offer.image} alt="" />}
                <span>
                  <b>{m.offer.title}</b>
                  <em>
                    {m.offer.place ? `${m.offer.place} · ` : ''}
                    {m.offer.priceINR !== null ? `${inr(m.offer.priceINR)} per person` : 'Price on request'}
                  </em>
                </span>
              </a>
            )}
            <p>{m.text}</p>
            <time>{hhmm(m.time)}</time>
          </div>
        ))}
        {typing && <div className="chat-typing">{AGENT_MODE ? 'Traveller' : 'Agent'} is typing…</div>}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          const t = draft
          setDraft('')
          void send(t)
        }}
      >
        <input
          value={draft}
          disabled={status !== 'ready' || !peer}
          placeholder={status === 'ready' ? (peer ? 'Write a message' : 'Waiting for a traveller') : 'Connecting'}
          onChange={(e) => {
            setDraft(e.target.value)
            if (peerRef.current) session.current?.typing(peerRef.current)
          }}
        />
        <button disabled={status !== 'ready' || !peer || !draft.trim()}>Send</button>
      </form>
      <footer className="chat-foot">Chat by Nexconn</footer>
    </section>
  )
}
