import { defaultQuestions, isLive, rulesIntent, type TravelIntent } from '../engine/travelIntent'

/**
 * Understand a request: /api/intent (Redis cache, then Claude Haiku, then Gemini) when the deployment has a
 * model key; otherwise, or on any failure, limit or timeout, the in-browser rule parser.
 */
export async function understand(text: string): Promise<TravelIntent> {
  const local = () => {
    const t = rulesIntent(text)
    return { ...t, questions: defaultQuestions(t) }
  }
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 12000)
    const res = await fetch('/api/intent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }), signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return local()
    const t = (await res.json()) as TravelIntent | { configured: false } | { fallback: string }
    if (!t || typeof t !== 'object' || !('must' in t) || !('party' in t)) return local()
    // the model asks its own questions; keep ours as a backstop if it asked none for missing fields
    const qs = t.questions?.length ? t.questions : defaultQuestions(t)
    return { ...t, source: t.source === 'gemini' ? 'gemini' : 'claude', questions: qs }
  } catch {
    return local()
  }
}

/** Count a committed search in the live analytics. Structured fields only; failures are ignored. */
export function track(t: TravelIntent) {
  try {
    fetch('/api/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ destination: t.destination, category: t.category, live: isLive(t), provider: t.source }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // analytics never blocks a search
  }
}
