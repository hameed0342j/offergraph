import { generateRecords } from '../data/sg/generate'
import { parseRecord } from '../engine/parse'
import { resolve, type Resolution } from '../engine/resolve'
import type { ParsedOffer, RawRecord } from '../engine/types'
import { ARBITER, AUTO } from '../engine/resolve'
import { resolveHotels, type HotelResolution } from '../engine/hotels'

// The engine runs once at startup on the labelled synthetic feed. "Now" is the page load time,
// so freshness ("checked 10:42") reads as live.

export const BOOT = Date.now()

export interface EngineData {
  records: RawRecord[]
  parsed: ParsedOffer[]
  res: Resolution
  histogram: { bins: number[]; decision: ('auto' | 'arbiter' | 'apart')[]; shares: [number, number, number]; median: number }
  parseMs: number
  hotels: HotelResolution
}

let cached: EngineData | null = null

export function engine(): EngineData {
  if (cached) return cached
  const records = generateRecords(20261115, BOOT)
  const t0 = performance.now()
  const parsed = records.map(parseRecord)
  const parseMs = performance.now() - t0
  const res = resolve(parsed)
  cached = { records, parsed, res, histogram: histogram(res), parseMs, hotels: resolveHotels() }
  return cached
}

/** 24 bins of match score from 1.0 down to 0, colored by the routing decision. */
function histogram(res: Resolution): EngineData['histogram'] {
  const n = 24
  const bins = new Array(n).fill(0)
  for (const p of res.pairs) bins[Math.min(n - 1, Math.floor((1 - p.score) * n))]++
  const decision = bins.map((_, i) => {
    const hi = 1 - i / n
    return hi > AUTO ? 'auto' : hi > ARBITER ? 'arbiter' : 'apart'
  }) as EngineData['histogram']['decision']
  const total = res.pairs.length
  const auto = res.pairs.filter((p) => p.decision === 'auto').length
  const arb = res.pairs.filter((p) => p.decision.startsWith('arbiter')).length
  const sorted = res.pairs.map((p) => p.score).sort((a, b) => b - a)
  const a = Math.round((auto / total) * 100)
  const b = Math.round((arb / total) * 100)
  return { bins, decision, shares: [a, b, 100 - a - b], median: sorted[Math.floor(sorted.length / 2)] ?? 0 }
}
