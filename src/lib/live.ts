import type { TravelIntent } from '../engine/travelIntent'

export interface LiveProduct {
  code: string
  title: string
  summary: string
  url: string | null
  image: string | null
  priceINR: number | null
  beforeINR: number | null
  rating: number | null
  reviews: number
  minutes: number | null
  maxMinutes: number | null
  flags: string[]
  instant: boolean
  pickup: string | null // pickup wording found in the listing text
  detail: {
    pickupType: 'everyone' | 'optional' | 'meet' | null
    fitness: 'easy' | 'medium' | 'hard' | null
    stroller: boolean
    wheelchair: boolean
    meals: string[]
    operator: string | null
  } | null // structured facts from the product record (leading results only)
}

export interface LiveResult {
  configured: boolean
  supplier?: string
  destination: { id: number; name: string; type: string; country: string | null } | null
  query?: string
  filters?: { flags: string[]; budget: number | null; start: string | null; end: string | null }
  total?: number
  checkedAt?: number
  supplierMs?: number
  cached?: boolean
  products?: LiveProduct[]
  error?: string
}

/** Ask /api/live for live supplier inventory matching the request's hard constraints. */
export async function fetchLive(t: TravelIntent): Promise<LiveResult> {
  const q = new URLSearchParams({ dest: t.destination ?? '' })
  if (t.dates.start) q.set('start', t.dates.start)
  if (t.dates.end) q.set('end', t.dates.end)
  if (t.budgetPerPersonINR) q.set('budget', String(t.budgetPerPersonINR))
  if (t.must.freeCancellation) q.set('fc', '1')
  if (t.must.skipTheLine) q.set('stl', '1')
  if (t.must.privateTransfer) q.set('pt', '1')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch(`/api/live?${q}`, { signal: ctrl.signal })
    const j = (await res.json().catch(() => ({}))) as LiveResult
    if (!res.ok) return { configured: true, destination: null, error: j.error ?? `http_${res.status}` }
    return j
  } catch {
    return { configured: true, destination: null, error: 'network' }
  } finally {
    clearTimeout(timer)
  }
}
