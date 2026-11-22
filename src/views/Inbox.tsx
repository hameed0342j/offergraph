// Agent inbox built with Nexconn Chat UI (drop-in components). Open the site with ?inbox: it connects as the
// agent desk and shows every traveller conversation in the ready-made Chat UI layout.
import { useEffect, useRef, useState } from 'react'

export const INBOX_MODE = new URLSearchParams(location.search).has('inbox')

export function AgentInbox() {
  const host = useRef<HTMLDivElement>(null)
  const [state, setState] = useState('Connecting to Nexconn…')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/chat-token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'agent' }) })
        const t = (await res.json()) as { appKey?: string; token?: string; error?: string }
        if (!t.appKey || !t.token) throw new Error(t.error ?? 'Chat is not configured')
        const { NCEngine, AreaCode } = await import('@nexconn/chat')
        const { NCChatUIApplication } = await import('@nexconn/chatui')
        NCEngine.initialize({ appKey: t.appKey, areaCode: AreaCode.SG })
        const app = NCChatUIApplication.initialize({
          hooks: {
            reqUserProfiles: async (ids: string[]) =>
              ids.map((userId) => ({
                userId,
                name: userId === 'og-agent' ? 'OfferGraph agent desk' : `Traveller ${userId.slice(2, 6)}`,
                avatarUrl: '',
              })),
            reqGroupProfiles: async () => [],
            reqSystemProfiles: async () => [],
            reqGroupMembers: async () => [],
          },
          language: 'en_US',
        })
        if (!app) throw new Error('Chat UI failed to start')
        app.ready()
        const r = await NCEngine.connect({ token: t.token })
        if (!r.isOk) throw new Error(`Could not connect (${r.code})`)
        if (cancelled || !host.current) return
        host.current.innerHTML = '<nc-chat-ui-app-provider style="display:block;height:100%"></nc-chat-ui-app-provider>'
        setState('')
      } catch (e) {
        setState(e instanceof Error ? e.message : 'Could not start the inbox')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#fff', color: '#14171f' }}>
      <header style={{ padding: '12px 18px', borderBottom: '1px solid #e3e6ee', font: '600 14px Inter, sans-serif', color: '#14171f', background: '#f8f9fc' }}>
        OfferGraph agent inbox · Nexconn Chat UI {state && <span style={{ fontWeight: 400, color: '#5b6475' }}>· {state}</span>}
      </header>
      <div ref={host} style={{ flex: 1, minHeight: 0 }} />
    </main>
  )
}
