import { SUPPLIER_BY_ID, reliabilityScore } from '../data/suppliers'
import type { HardKey, Intent } from './intent'
import { BM25, tokens } from './text'
import type { Entity, Offer, Variant } from './types'

export type Mode = 'match' | 'value' | 'flexible'
export type Check = 'pass' | 'fail' | 'unknown'
export type Status = 'eligible' | 'partial' | 'excluded'

export const MODES: Record<Mode, { label: string; w: Weights }> = {
  match: { label: 'Best match', w: { rel: 0.16, soft: 0.32, price: 0.12, reliability: 0.14, content: 0.08, policy: 0.1, fresh: 0.08 } },
  value: { label: 'Best value', w: { rel: 0.1, soft: 0.14, price: 0.4, reliability: 0.14, content: 0.04, policy: 0.1, fresh: 0.08 } },
  flexible: { label: 'Most flexible', w: { rel: 0.1, soft: 0.16, price: 0.1, reliability: 0.14, content: 0.04, policy: 0.38, fresh: 0.08 } },
}

export interface Weights {
  rel: number
  soft: number
  price: number
  reliability: number
  content: number
  policy: number
  fresh: number
}

export interface Reason {
  kind: 'fact' | 'inference' | 'unverified'
  text: string
  source?: string
}

export interface ScoredOffer {
  offer: Offer
  checks: Partial<Record<HardKey, Check>>
  eligible: boolean
  score: number
  signals: { price: number; reliability: number; policy: number; fresh: number }
  tieBreak: boolean // margin decided between near-equal offers (internal only)
}

export interface Result {
  entity: Entity
  variant: Variant
  status: Status
  checks: Partial<Record<HardKey, Check>>
  best: ScoredOffer | null
  offers: ScoredOffer[]
  score: number // 0..100
  signals: Record<keyof Weights, number>
  reasons: Reason[]
}

export interface Ranking {
  results: Result[] // every variant, eligible first
  topPerEntity: Result[]
  funnel: { label: string; value: number; kind: 'base' | 'hard' | 'soft' | 'result' }[]
  counts: { offers: number; variants: number; entities: number; eligibleOffers: number; eligibleVariants: number }
  ms: number
}

const minutes = (now: number, t: number) => Math.max(0, (now - t) / 60000)
export const freshness = (now: number, t: number) => Math.max(0, Math.min(1, 1 - (minutes(now, t) - 15) / 165))
const policyOf = (o: Offer) => {
  const c = o.cancelH === null ? 0.3 : o.cancelH >= 72 ? 1 : o.cancelH >= 48 ? 0.85 : o.cancelH >= 24 ? 0.7 : 0
  const a = o.availability === 'instant' ? 1 : o.availability === 'on-request' ? 0.4 : 0
  return c * 0.65 + a * 0.35
}
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y)
  return s.length ? s[Math.floor((s.length - 1) / 2)] : 0
}

function offerChecks(o: Offer, intent: Intent): Partial<Record<HardKey, Check>> {
  const c: Partial<Record<HardKey, Check>> = {}
  for (const h of intent.hard) {
    if (h.key === 'freeCancel') c.freeCancel = o.cancelH === null ? 'unknown' : o.cancelH >= Number(h.value ?? 24) ? 'pass' : 'fail'
    if (h.key === 'maxPrice') c.maxPrice = o.priceINR <= Number(h.value) ? 'pass' : 'fail'
  }
  return c
}

function variantChecks(e: Entity, v: Variant, intent: Intent): Partial<Record<HardKey, Check>> {
  const c: Partial<Record<HardKey, Check>> = {}
  for (const h of intent.hard) {
    switch (h.key) {
      case 'destination':
        c.destination = 'pass'
        break
      case 'family':
        c.family = e.family === null ? 'unknown' : e.family ? 'pass' : 'fail'
        break
      case 'transfer':
        c.transfer = v.inclusions.transfer === null ? 'unknown' : v.inclusions.transfer === 'none' ? 'fail' : 'pass'
        break
      case 'privateTransfer':
        c.privateTransfer = v.inclusions.transfer === null ? 'unknown' : v.inclusions.transfer === 'private' ? 'pass' : 'fail'
        break
      case 'meal':
        c.meal = v.inclusions.meals === 'meal' || v.inclusions.meals === 'fine' ? 'pass' : 'fail'
        break
      case 'fastTrack':
        c.fastTrack = v.inclusions.access === 'fast-track' || v.inclusions.access === 'vip' ? 'pass' : 'fail'
        break
    }
  }
  return c
}

const worst = (cs: Check[]): Check => (cs.includes('fail') ? 'fail' : cs.includes('unknown') ? 'unknown' : 'pass')

function softScore(e: Entity, v: Variant, intent: Intent): number {
  if (!intent.soft.length) return 0.5
  let s = 0
  for (const p of intent.soft) {
    if (p.key === 'lowWalking') s += e.walking === 'low' ? 1 : e.walking === 'moderate' ? 0.45 : e.walking === 'high' ? 0 : 0.35
    if (p.key === 'relaxing') s += e.relaxing ? 1 : 0.2
    if (p.key === 'evening') s += /night|wings/.test(e.id) || e.category === 'show' ? 1 : 0.2
    if (p.key === 'wildlife') s += e.category === 'wildlife' ? 1 : 0
    if (p.key === 'views') s += e.category === 'viewpoint' ? 1 : 0.15
    if (p.key === 'water') s += e.category === 'cruise' || (v.inclusions.activities ?? []).some((a) => /boat|ferry|cruise/.test(a)) ? 1 : 0
  }
  return s / intent.soft.length
}

const SUP = (id: string) => SUPPLIER_BY_ID[id]

export function rank(entities: Entity[], intent: Intent, mode: Mode, now: number, weights?: Weights): Ranking {
  const t0 = performance.now()
  const w = weights ?? MODES[mode].w
  const flat: { e: Entity; v: Variant }[] = []
  for (const e of entities) for (const v of e.variants) flat.push({ e, v })

  // retrieval relevance: BM25 over attraction + variant description
  const docs = flat.map(({ e, v }) =>
    tokens(`${e.name} ${e.category} ${v.name} ${(v.inclusions.activities ?? []).join(' ')} ${e.relaxing ? 'relaxing' : ''} ${e.family ? 'family kids' : ''} ${e.category === 'wildlife' ? 'animals' : ''}`),
  )
  const bm = new BM25(docs)
  const q = tokens(intent.text)
  const rel = flat.map((_, i) => bm.score(q, i))
  const relMax = Math.max(1e-6, ...rel)

  const allPrices = flat.flatMap(({ v }) => v.offers.map((o) => o.priceINR))
  const pMin = Math.min(...allPrices)
  const pMax = Math.max(...allPrices)

  const results: Result[] = flat.map(({ e, v }, i) => {
    const vc = variantChecks(e, v, intent)
    const med = median(v.offers.map((o) => o.priceINR))
    const scored: ScoredOffer[] = v.offers.map((o) => {
      const oc = offerChecks(o, intent)
      const sup = SUP(o.supplier)
      const signals = {
        price: Math.max(0, Math.min(1, 0.5 + (med - o.priceINR) / Math.max(1, med) * 4)),
        reliability: sup ? reliabilityScore(sup) / 100 : 0.5,
        policy: policyOf(o),
        fresh: freshness(now, o.checkedAt),
      }
      return {
        offer: o,
        checks: oc,
        eligible: worst(Object.values(oc)) === 'pass' && o.availability !== 'sold-out',
        score: 0.35 * signals.price + 0.3 * signals.reliability + 0.2 * signals.policy + 0.15 * signals.fresh,
        signals,
        tieBreak: false,
      }
    })
    scored.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score)
    // margin only breaks near-ties between eligible offers, and is never shown to agents
    if (scored.length > 1 && scored[0].eligible && scored[1].eligible && Math.abs(scored[0].score - scored[1].score) < 0.01) {
      const ca = SUP(scored[0].offer.supplier)?.commission ?? 0
      const cb = SUP(scored[1].offer.supplier)?.commission ?? 0
      if (cb > ca) [scored[0], scored[1]] = [scored[1], scored[0]]
      scored[0].tieBreak = true
    }
    const best = scored[0] ?? null
    const vStatus = worst(Object.values(vc))
    const oStatus: Check = scored.some((s) => s.eligible) ? 'pass' : scored.some((s) => worst(Object.values(s.checks)) !== 'fail' && s.offer.availability !== 'sold-out') ? 'unknown' : 'fail'
    const st = worst([vStatus, oStatus])
    const status: Status = st === 'pass' ? 'eligible' : st === 'unknown' ? 'partial' : 'excluded'
    const bestPrice = best?.offer.priceINR ?? med
    const signals = {
      rel: rel[i] / relMax,
      soft: softScore(e, v, intent),
      price: 0.5 * (best?.signals.price ?? 0.5) + 0.5 * (1 - (bestPrice - pMin) / Math.max(1, pMax - pMin)),
      reliability: best?.signals.reliability ?? 0.5,
      content: e.contentScore,
      policy: best?.signals.policy ?? 0,
      fresh: best?.signals.fresh ?? 0,
    }
    const score = 100 * (Object.keys(w) as (keyof Weights)[]).reduce((s, k) => s + w[k] * signals[k], 0) / Object.values(w).reduce((a, b) => a + b, 0)
    return { entity: e, variant: v, status, checks: { ...vc, ...(best ? best.checks : {}) }, best, offers: scored, score, signals, reasons: explain(e, v, best, intent, now) }
  })

  const order = { eligible: 0, partial: 1, excluded: 2 }
  results.sort((a, b) => order[a.status] - order[b.status] || b.score - a.score)
  const seen = new Set<string>()
  const topPerEntity = results.filter((r) => r.status !== 'excluded' && !seen.has(r.entity.id) && (seen.add(r.entity.id), true))

  // funnel over offers: each hard constraint applied in turn
  const offersAll = results.flatMap((r) => r.offers.map((o) => ({ r, o })))
  const funnel: Ranking['funnel'] = [{ label: 'Candidate offers', value: offersAll.length, kind: 'base' }]
  let pool = offersAll
  for (const h of intent.hard) {
    if (h.key === 'destination') continue
    const offerLevel = h.key === 'freeCancel' || h.key === 'maxPrice'
    pool = pool.filter(({ r, o }) => (offerLevel ? o.checks[h.key] : r.checks[h.key]) === 'pass')
    funnel.push({ label: h.label, value: pool.length, kind: 'hard' })
  }
  const eligibleOffers = pool.filter(({ o }) => o.offer.availability !== 'sold-out')
  for (const s of intent.soft) {
    if (s.key === 'lowWalking') funnel.push({ label: 'Low walking, stated', value: eligibleOffers.filter(({ r }) => r.entity.walking === 'low').length, kind: 'soft' })
  }
  const lastHard = [...funnel].reverse().find((f) => f.kind === 'hard')
  if (lastHard) lastHard.kind = 'result'

  return {
    results,
    topPerEntity,
    funnel,
    counts: {
      offers: offersAll.length,
      variants: results.length,
      entities: entities.length,
      eligibleOffers: eligibleOffers.length,
      eligibleVariants: results.filter((r) => r.status === 'eligible').length,
    },
    ms: performance.now() - t0,
  }
}

export const SUPPLIER_LABEL = (id: string) => SUPPLIER_BY_ID[id]?.name ?? id

export function clock(t: number): string {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function explain(e: Entity, v: Variant, best: ScoredOffer | null, intent: Intent, now: number): Reason[] {
  const out: Reason[] = []
  const o = best?.offer
  const ev = (o ? o.parsed : null)?.inclusions.transfer.evidence
  if (v.inclusions.transfer && v.inclusions.transfer !== 'none') out.push({ kind: 'fact', text: `${v.inclusions.transfer === 'private' ? 'Private' : 'Shared'} transfer included`, source: ev ? `${SUPPLIER_LABEL(o!.supplier)}: "${ev.text}"` : undefined })
  if (v.inclusions.transfer === null) out.push({ kind: 'unverified', text: 'Transfer not stated by the supplier' })
  if (o) {
    if (o.cancelH !== null && o.cancelH > 0) out.push({ kind: 'fact', text: `Free cancellation until ${o.cancelH}h before`, source: `${SUPPLIER_LABEL(o.supplier)} policy` })
    else if (o.cancelH === 0) out.push({ kind: 'fact', text: 'Non-refundable', source: `${SUPPLIER_LABEL(o.supplier)} policy` })
    else out.push({ kind: 'unverified', text: 'Cancellation terms not stated' })
    out.push({ kind: 'fact', text: `Price checked ${clock(o.checkedAt)}${minutes(now, o.checkedAt) > 60 ? ', recheck before booking' : ''}`, source: SUPPLIER_LABEL(o.supplier) })
    if (o.availability === 'on-request') out.push({ kind: 'fact', text: 'On request, not instant', source: SUPPLIER_LABEL(o.supplier) })
  }
  const wantsWalk = intent.soft.some((s) => s.key === 'lowWalking')
  if (wantsWalk) {
    if (e.walking) {
      const src = e.variants.flatMap((x) => x.offers).find((x) => x.parsed.walking.value === e.walking)
      out.push({ kind: 'fact', text: `${e.walking === 'low' ? 'Low' : e.walking === 'moderate' ? 'Moderate' : 'High'} walking`, source: src ? `${SUPPLIER_LABEL(src.supplier)}: "${src.parsed.walking.evidence?.text}"` : undefined })
    } else out.push({ kind: 'unverified', text: 'Walking level not verified' })
  }
  if (intent.soft.some((s) => s.key === 'relaxing') && e.relaxing) out.push({ kind: 'inference', text: 'Relaxing pace', source: `inferred from attraction type (${e.category})` })
  if (intent.hard.some((h) => h.key === 'family')) {
    if (e.family === true) out.push({ kind: 'fact', text: 'Suitable for families' })
    else if (e.family === null) out.push({ kind: 'unverified', text: 'Family suitability not stated' })
  }
  return out
}
