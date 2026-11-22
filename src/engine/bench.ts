import { CATALOG } from '../data/sg/catalog'
import { mulberry32 } from '../data/sg/generate'
import { parseIntent, type HardKey } from './intent'
import { rank } from './rank'
import type { Resolution } from './resolve'
import { BM25, jaroWinkler, normalize, tokens } from './text'
import type { ParsedOffer, RawRecord } from './types'

// Labelled benchmark on the synthetic dataset. Every number on the Benchmark page comes from here.

interface TruthQuery {
  text: string
  hard: { family: boolean; transfer: boolean; private: boolean; freeCancel: boolean; meal: boolean; maxPrice: number | null }
  soft: { lowWalking: boolean; wildlife: boolean; views: boolean; water: boolean }
}

const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)]

export function makeQueries(n = 120, seed = 7): TruthQuery[] {
  const r = mulberry32(seed)
  const qs: TruthQuery[] = []
  for (let i = 0; i < n; i++) {
    const hard = {
      family: r() < 0.6,
      transfer: r() < 0.55,
      private: false,
      freeCancel: r() < 0.5,
      meal: r() < 0.15,
      maxPrice: r() < 0.25 ? pick(r, [3000, 4000, 5000, 6000]) : null,
    }
    if (hard.transfer && r() < 0.15) hard.private = true
    const soft = { lowWalking: r() < 0.35, wildlife: r() < 0.2, views: r() < 0.15, water: r() < 0.12 }
    const parts: string[] = [pick(r, ['Find', 'Looking for', 'Need', 'Suggest', 'Book'])]
    const lead = hard.family ? pick(r, ['a family', 'a kid-friendly', 'a', 'a fun']) : pick(r, ['a', 'a nice', 'a fun'])
    parts.push(lead)
    parts.push(pick(r, ['experience', 'activity', 'sightseeing trip', 'day out', 'tour']) + ' in Singapore')
    // a family request must say so somewhere in the text
    if (hard.family && (lead === 'a' || lead === 'a fun')) parts.push(pick(r, ['for 2 adults and 2 kids', 'for my family', 'with children']))
    if (hard.private) parts.push(pick(r, ['with a private transfer', 'by private car']))
    else if (hard.transfer) parts.push(pick(r, ['with transport', 'with hotel pickup', 'including transfers', 'transport included']))
    if (hard.meal) parts.push(pick(r, ['with dinner', 'dinner included']))
    if (hard.freeCancel) parts.push(pick(r, ['and flexible cancellation', 'with free cancellation', 'fully refundable', 'no cancellation fees']))
    if (hard.maxPrice) parts.push(pick(r, [`under ₹${hard.maxPrice.toLocaleString('en-IN')}`, `below ${hard.maxPrice}`, `max ${hard.maxPrice / 1000}k`]))
    if (soft.lowWalking) parts.push(pick(r, ['avoid strenuous walking', 'not much walking', 'stroller friendly', 'my parents cannot walk far']))
    if (soft.wildlife) parts.push(pick(r, ['with animals', 'see wildlife']))
    if (soft.views) parts.push(pick(r, ['with great views', 'skyline views']))
    if (soft.water) parts.push(pick(r, ['on the water', 'a boat trip']))
    qs.push({ text: parts.join(' ').replace(/\s+/g, ' ') + '.', hard, soft })
  }
  return qs
}

// ---- ground truth --------------------------------------------------------------------------

const VT = new Map(CATALOG.flatMap((e) => e.variants.map((v) => [v.id, { e, v }])))

function truthOK(rec: RawRecord, q: TruthQuery, price: number): boolean {
  const t = VT.get(rec.truth.variant)!
  const h = q.hard
  if (h.family && !t.e.family) return false
  if (h.transfer && t.v.transfer === 'none') return false
  if (h.private && t.v.transfer !== 'private') return false
  if (h.meal && !(t.v.meals === 'meal' || t.v.meals === 'fine')) return false
  if (h.freeCancel && !(rec.truth.cancelH !== null && rec.truth.cancelH >= 24)) return false
  if (h.maxPrice && price > h.maxPrice) return false
  return rec.availability !== 'sold-out'
}

function gain(variant: string, q: TruthQuery): number {
  const t = VT.get(variant)!
  const softs: boolean[] = []
  if (q.soft.lowWalking) softs.push(t.e.walking === 'low')
  if (q.soft.wildlife) softs.push(t.e.category === 'wildlife')
  if (q.soft.views) softs.push(t.e.category === 'viewpoint')
  if (q.soft.water) softs.push(t.e.category === 'cruise' || t.v.activities.some((a) => /boat|ferry/.test(a)))
  return softs.length && softs.every(Boolean) ? 2 : 1
}

interface Pick {
  rec: RawRecord
}

export interface SystemScore {
  p10: number
  r10: number
  ndcg10: number
  violations: number // share of top-10 results that break a hard constraint
  duplicates: number // share of top-10 slots spent on a variant already shown
}

function evaluate(list: Pick[], q: TruthQuery, prices: Map<string, number>, relevant: Map<string, number>): SystemScore {
  const top = list.slice(0, 10)
  const seen = new Set<string>()
  let hits = 0
  let dcg = 0
  let viol = 0
  let dup = 0
  top.forEach((p, i) => {
    const vId = p.rec.truth.variant
    const ok = truthOK(p.rec, q, prices.get(p.rec.id)!)
    if (!ok) viol++
    if (seen.has(vId)) {
      dup++
      return
    }
    seen.add(vId)
    if (ok && relevant.has(vId)) {
      hits++
      dcg += (2 ** relevant.get(vId)! - 1) / Math.log2(i + 2)
    }
  })
  const ideal = [...relevant.values()].sort((a, b) => b - a).slice(0, 10)
  const idcg = ideal.reduce((s, g, i) => s + (2 ** g - 1) / Math.log2(i + 2), 0)
  return {
    p10: hits / 10,
    r10: relevant.size ? hits / Math.min(10, relevant.size) : 1,
    ndcg10: idcg ? dcg / idcg : 1,
    violations: top.length ? viol / top.length : 0,
    duplicates: top.length ? dup / top.length : 0,
  }
}

// ---- systems ---------------------------------------------------------------------------------

function keywordBaseline(parsed: ParsedOffer[], bm: BM25, q: string): Pick[] {
  const qt = tokens(q)
  return parsed
    .map((p, i) => ({ p, s: bm.score(qt, i) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => ({ rec: x.p.record }))
}

/** fuzzy-title dedupe, computed once: the cheapest record of each title group stands for it */
function fuzzyReps(parsed: ParsedOffer[]): ParsedOffer[] {
  const reps: ParsedOffer[] = []
  const keys: string[] = []
  for (const p of [...parsed].sort((a, b) => a.priceINR - b.priceINR)) {
    const t = normalize(p.record.title)
    if (keys.some((k) => jaroWinkler(k, t) >= 0.9)) continue
    reps.push(p)
    keys.push(t)
  }
  return reps
}

function fuzzyBaseline(reps: ParsedOffer[], q: string): Pick[] {
  // naive keyword filters on the deduped list, then lowest price first
  const ql = q.toLowerCase()
  const wantT = /transport|transfer|pick ?up|pickup|private car/.test(ql)
  const wantC = /cancell|refundable/.test(ql)
  const wantM = /dinner|meal|lunch/.test(ql)
  const fam = /family|kid|children/.test(ql)
  return reps
    .filter((p) => {
      const text = `${p.record.title} ${p.record.description}`.toLowerCase()
      if (wantT && !/transfer|pick-?up|pickup|shuttle|trf|chauffeur/.test(text)) return false
      if (wantC && !/free|refund/.test(p.record.cancellation.toLowerCase())) return false
      if (wantM && !/dinner|meal|lunch|breakfast/.test(text)) return false
      if (fam && /not recommended for children/.test(text)) return false
      return true
    })
    .map((p) => ({ rec: p.record }))
}

function proposed(res: Resolution, q: string, now: number): { list: Pick[]; ms: number } {
  const t0 = performance.now()
  const intent = parseIntent(q)
  const rk = rank(res.entities, intent, 'match', now)
  const list = rk.results.filter((r) => r.status === 'eligible' && r.best).map((r) => ({ rec: r.best!.offer.parsed.record }))
  return { list, ms: performance.now() - t0 }
}

export interface BenchResult {
  queries: number
  records: number
  variants: number
  entities: number
  systems: { key: string; label: string; score: SystemScore }[]
  intentAccuracy: number
  intentMisses: string[]
  latency: { p50: number; p95: number }
  matching: { entityP: number; entityR: number; variantP: number; variantR: number; falseMerge: { name: string; rate: number }[] }
  attributes: { name: string; coverage: number; accuracy: number }[]
  sample: TruthQuery[]
}

const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length)
const pct = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y)
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]
}

function intentMatches(q: TruthQuery, text: string) {
  const it = parseIntent(text)
  const keys = new Set<HardKey>(it.hard.map((h) => h.key))
  const want = new Set<HardKey>(['destination'])
  if (q.hard.family) want.add('family')
  if (q.hard.private) want.add('privateTransfer')
  else if (q.hard.transfer) want.add('transfer')
  if (q.hard.freeCancel) want.add('freeCancel')
  if (q.hard.meal) want.add('meal')
  if (q.hard.maxPrice) want.add('maxPrice')
  const price = it.hard.find((h) => h.key === 'maxPrice')?.value
  const sameKeys = keys.size === want.size && [...want].every((k) => keys.has(k))
  const softOk = !q.soft.lowWalking || it.soft.some((s) => s.key === 'lowWalking')
  return sameKeys && softOk && (!q.hard.maxPrice || price === q.hard.maxPrice)
}

export function runBenchmark(parsed: ParsedOffer[], res: Resolution, now: number): BenchResult {
  const qs = makeQueries()
  const prices = new Map(parsed.map((p) => [p.record.id, p.priceINR]))
  const bm = new BM25(parsed.map((p) => p.tokens))
  const reps = fuzzyReps(parsed)
  const scores: Record<string, SystemScore[]> = { keyword: [], fuzzy: [], proposed: [] }
  const times: number[] = []
  let intentOk = 0
  const misses: string[] = []
  for (const q of qs) {
    const relevant = new Map<string, number>()
    for (const p of parsed) if (truthOK(p.record, q, p.priceINR)) relevant.set(p.record.truth.variant, gain(p.record.truth.variant, q))
    scores.keyword.push(evaluate(keywordBaseline(parsed, bm, q.text), q, prices, relevant))
    scores.fuzzy.push(evaluate(fuzzyBaseline(reps, q.text), q, prices, relevant))
    const pr = proposed(res, q.text, now)
    times.push(pr.ms)
    scores.proposed.push(evaluate(pr.list, q, prices, relevant))
    if (intentMatches(q, q.text)) intentOk++
    else if (misses.length < 4) misses.push(q.text)
  }
  const agg = (a: SystemScore[]): SystemScore => ({
    p10: avg(a.map((x) => x.p10)),
    r10: avg(a.map((x) => x.r10)),
    ndcg10: avg(a.map((x) => x.ndcg10)),
    violations: avg(a.map((x) => x.violations)),
    duplicates: avg(a.map((x) => x.duplicates)),
  })

  // matching quality, pairwise against labels
  const recs = parsed.map((p) => p.record)
  let etp = 0, efp = 0, efn = 0, vtp = 0, vfp = 0, vfn = 0
  let entMergeFalse = 0, entMergeAll = 0, fzFalse = 0, fzAll = 0
  const fuzzyGroup = new Map<string, number>()
  const fzKeys: string[] = []
  for (const r of recs) {
    const t = normalize(r.title)
    let g = fzKeys.findIndex((x) => jaroWinkler(x, t) >= 0.9)
    if (g < 0) {
      fzKeys.push(t)
      g = fzKeys.length - 1
    }
    fuzzyGroup.set(r.id, g)
  }
  for (let i = 0; i < recs.length; i++) {
    for (let j = i + 1; j < recs.length; j++) {
      const a = recs[i]
      const b = recs[j]
      const sameE = a.truth.entity === b.truth.entity
      const predE = res.entityOf.get(a.id) === res.entityOf.get(b.id)
      if (sameE && predE) etp++
      else if (!sameE && predE) efp++
      else if (sameE && !predE) efn++
      const sameV = a.truth.variant === b.truth.variant
      if (sameE) {
        const predV = res.variantOf.get(a.id) === res.variantOf.get(b.id)
        if (sameV && predV) vtp++
        else if (!sameV && predV) vfp++
        else if (sameV && !predV) vfn++
        // attraction-level dedup (one card per attraction, like property-only mapping)
        entMergeAll++
        if (!sameV) entMergeFalse++
      }
      if (fuzzyGroup.get(a.id) === fuzzyGroup.get(b.id)) {
        fzAll++
        if (!sameV) fzFalse++
      }
    }
  }
  let ourAll = 0
  let ourFalse = 0
  for (const e of res.entities) for (const v of e.variants) {
    const ids = v.offers.map((o) => o.parsed.record)
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      ourAll++
      if (ids[i].truth.variant !== ids[j].truth.variant) ourFalse++
    }
  }

  // attribute accuracy against labels
  const attr = (name: string, get: (p: ParsedOffer) => unknown, truth: (p: ParsedOffer) => unknown) => {
    let known = 0
    let ok = 0
    for (const p of parsed) {
      const v = get(p)
      if (v === null || v === undefined) continue
      known++
      if (JSON.stringify(v) === JSON.stringify(truth(p))) ok++
    }
    return { name, coverage: known / parsed.length, accuracy: known ? ok / known : 0 }
  }
  const tv = (p: ParsedOffer) => VT.get(p.record.truth.variant)!.v
  const attributes = [
    attr('Transfer', (p) => p.inclusions.transfer.value, (p) => tv(p).transfer),
    attr('Meals', (p) => p.inclusions.meals.value, (p) => tv(p).meals),
    attr('Access', (p) => p.inclusions.access.value, (p) => tv(p).access),
    attr('Activity options', (p) => [...(p.inclusions.activities.value ?? [])].sort(), (p) => [...tv(p).activities].sort()),
    attr('Duration', (p) => p.inclusions.durationH.value, (p) => tv(p).durationH),
    attr('Guide', (p) => p.inclusions.guide.value, (p) => tv(p).guide),
    attr('Cancellation', (p) => p.cancelH.value, (p) => p.record.truth.cancelH),
    attr('Walking', (p) => p.walking.value, (p) => p.record.truth.walking),
  ]

  return {
    queries: qs.length,
    records: parsed.length,
    variants: res.entities.reduce((s, e) => s + e.variants.length, 0),
    entities: res.entities.length,
    systems: [
      { key: 'keyword', label: 'Keyword search', score: agg(scores.keyword) },
      { key: 'fuzzy', label: 'Fuzzy match + price sort', score: agg(scores.fuzzy) },
      { key: 'proposed', label: 'OfferGraph', score: agg(scores.proposed) },
    ],
    intentAccuracy: intentOk / qs.length,
    intentMisses: misses,
    latency: { p50: pct(times, 0.5), p95: pct(times, 0.95) },
    matching: {
      entityP: etp / Math.max(1, etp + efp),
      entityR: etp / Math.max(1, etp + efn),
      variantP: vtp / Math.max(1, vtp + vfp),
      variantR: vtp / Math.max(1, vtp + vfn),
      falseMerge: [
        { name: 'One card per attraction', rate: entMergeFalse / Math.max(1, entMergeAll) },
        { name: 'Fuzzy title match', rate: fzFalse / Math.max(1, fzAll) },
        { name: 'OfferGraph variants', rate: ourFalse / Math.max(1, ourAll) },
      ],
    },
    attributes,
    sample: qs.slice(0, 6),
  }
}
