import { CATALOG, CLUSTERS } from '../data/sg/catalog'
import { coreName } from './parse'
import { haversineM, jaccard, jaroWinkler, normalize, tokens } from './text'
import type { Entity, Inclusions, MatchPair, Offer, ParsedOffer, Variant } from './types'

// Entity resolution (records -> attractions) and variant equivalence (offers -> variants).

export const AUTO = 0.85
export const ARBITER = 0.45

/**
 * Partial alias knowledge (a POI knowledge graph would supply this in production).
 * Deliberately incomplete: most aliases must be matched from text and location.
 */
const KB_GROUPS = [
  ['river wonders', 'river safari'],
  ['bird paradise', 'jurong bird park'],
  ['sea aquarium', 'singapore oceanarium'],
  ['gardens by the bay', 'flower dome and cloud forest', 'gbtb'],
  ['southern islands ferry', 'kusu and st john island ferry'],
  ['jewel changi canopy park', 'jewel rain vortex canopy park'],
].map((g) => g.map((n) => tokens(n).join(' ')))

function kbSame(a: string, b: string): boolean {
  return KB_GROUPS.some((g) => g.some((x) => a.includes(x)) && g.some((x) => b.includes(x)))
}

/** token overlap that treats prefixes as matches ("zoo" ~ "zoological") */
function softOverlap(a: string[], b: string[]): number {
  let n = 0
  for (const x of a) if (b.some((y) => x === y || (x.length >= 3 && y.length >= 3 && (x.startsWith(y) || y.startsWith(x))))) n++
  return n
}

const TYPE_WORDS = new Set(['zoo', 'safari', 'aquarium', 'oceanarium', 'cruise', 'wonder', 'paradise', 'luge', 'wing', 'show', 'flyer', 'skypark', 'garden', 'centre', 'park', 'bus', 'walk', 'ferry', 'deck', 'tour'])
/** place words say where, not what: two attractions in Sentosa are not the same attraction */
const LOCATION_WORDS = new Set(['sentosa', 'mandai', 'marina', 'bay', 'changi', 'jurong', 'singapore', 'sg', 'orchard', 'downtown'])

/** core name without place words (kept when nothing else is left) */
export function distinct(core: string[]): string[] {
  const d = core.filter((t) => !LOCATION_WORDS.has(t))
  return d.length ? d : core
}

function acronymOf(full: string): string {
  return normalize(full)
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
}

export interface Features {
  name: number
  geo: number | null
  tokens: number
  kb: boolean
  kbConflict: boolean
}

/** weighted overlap: type words ("garden", "safari") count less than distinctive words */
function weighted(a: string[], b: string[]) {
  const wt = (t: string) => (TYPE_WORDS.has(t) ? 0.4 : 1)
  let ov = 0
  for (const x of a) if (b.some((y) => x === y || (x.length >= 3 && y.length >= 3 && (x.startsWith(y) || y.startsWith(x))))) ov += wt(x)
  const wa = a.reduce((s, t) => s + wt(t), 0)
  const wb = b.reduce((s, t) => s + wt(t), 0)
  return { ov, wa, wb }
}

const kbKey = (r: ParsedOffer['record']) => tokens(r.title).join(' ')

export function features(a: ParsedOffer, b: ParsedOffer, ca: string[], cb: string[]): Features {
  const { ov, wa, wb } = weighted(ca, cb)
  const jac = ov / Math.max(0.4, wa + wb - ov)
  // containment only counts when the shorter name has a distinctive word of its own
  const shorter = wa <= wb ? ca : cb
  const contain = shorter.some((t) => !TYPE_WORDS.has(t)) ? ov / Math.max(0.4, Math.min(wa, wb)) : jac
  const jw = jaroWinkler(ca.join(' '), cb.join(' '))
  const name = Math.min(1, Math.max(jac, 0.9 * contain, 0.7 * jw))
  const rel = kbRelation(a, b, ca, cb)
  let geo: number | null = null
  const ra = a.record
  const rb = b.record
  if (ra.lat !== null && rb.lat !== null && ra.lon !== null && rb.lon !== null) {
    const d = haversineM(ra.lat, ra.lon, rb.lat, rb.lon)
    geo = d <= 250 ? 1 : d >= 1500 ? 0 : 1 - (d - 250) / 1250
  }
  return { name, geo, tokens: jaccard(a.tokens, b.tokens), kb: rel === 'same', kbConflict: rel === 'conflict' }
}

/**
 * same: both names are aliases of one attraction in the knowledge graph.
 * conflict: one name is a known alias of attraction X and the other shares no distinctive word with any name of X.
 */
export function kbRelation(a: ParsedOffer, b: ParsedOffer, ca: string[], cb: string[]): 'same' | 'conflict' | 'none' {
  const ka = kbKey(a.record)
  const kbb = kbKey(b.record)
  const ga = KB_GROUPS.findIndex((g) => g.some((x) => ka.includes(x)))
  const gb = KB_GROUPS.findIndex((g) => g.some((x) => kbb.includes(x)))
  if (ga >= 0 && ga === gb) return 'same'
  const sharesWithGroup = (core: string[], g: number) => {
    const d = core.filter((t) => !TYPE_WORDS.has(t))
    return KB_GROUPS[g].some((n) => softOverlap(d, n.split(' ').filter((t) => !TYPE_WORDS.has(t) && !LOCATION_WORDS.has(t))) > 0)
  }
  if (ga >= 0 && gb >= 0) return 'conflict'
  if (ga >= 0 && !sharesWithGroup(cb, ga)) return 'conflict'
  if (gb >= 0 && !sharesWithGroup(ca, gb)) return 'conflict'
  return 'none'
}

export function matchScore(f: Features): number {
  const z = -6 + 7.5 * f.name + 3 * (f.geo ?? 0.5) + 0.8 * f.tokens + (f.kb ? 6 : 0) - (f.kbConflict ? 6 : 0)
  return 1 / (1 + Math.exp(-z))
}

/**
 * Arbiter for the grey zone. In production this is an LLM returning structured JSON
 * (SAME / DIFFERENT / NEEDS_REVIEW) with reasons; offline it is this rule set, labelled as such.
 */
export function arbiter(a: ParsedOffer, b: ParsedOffer, ca: string[], cb: string[], f: Features): { same: boolean; reason: string } {
  if (f.kb) return { same: true, reason: 'Known alias in the attraction knowledge graph' }
  if (f.kbConflict) return { same: false, reason: 'Knowledge graph maps the names to different attractions' }
  const ta = ca.filter((t) => TYPE_WORDS.has(t))
  const tb = cb.filter((t) => TYPE_WORDS.has(t))
  if (ta.length && tb.length && !ta.some((t) => tb.includes(t))) return { same: false, reason: `Different attraction types: ${ta.join(' ')} vs ${tb.join(' ')}` }
  const sa = ca.join('')
  const sb = cb.join('')
  if (sa.length <= 5 && acronymOf(b.record.title).includes(sa)) return { same: true, reason: `"${sa.toUpperCase()}" is an acronym of the other name` }
  if (sb.length <= 5 && acronymOf(a.record.title).includes(sb)) return { same: true, reason: `"${sb.toUpperCase()}" is an acronym of the other name` }
  // shared words must say what the attraction is, not only its type or place
  const da = ca.filter((t) => !TYPE_WORDS.has(t))
  const db = cb.filter((t) => !TYPE_WORDS.has(t))
  const shared = softOverlap(da, db)
  if (da.length && db.length && shared === 0) return { same: false, reason: 'No distinctive word in common' }
  const contain = softOverlap(ca, cb) / Math.max(1, Math.min(ca.length, cb.length))
  if (contain >= 0.99) return { same: true, reason: 'One name contains the other' }
  if (f.geo !== null && f.geo >= 0.98 && shared >= 1) return { same: true, reason: 'Same meeting point and a distinctive shared word' }
  return { same: false, reason: 'Names and evidence do not agree' }
}

class DSU {
  p: number[]
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i)
  }
  find(x: number): number {
    while (this.p[x] !== x) x = this.p[x] = this.p[this.p[x]]
    return x
  }
  union(a: number, b: number) {
    this.p[this.find(a)] = this.find(b)
  }
}

export interface Resolution {
  entities: Entity[]
  pairs: MatchPair[]
  candidatePairs: number
  totalPairs: number
  entityOf: Map<string, string> // record id -> entity id
  variantOf: Map<string, string> // record id -> variant id
  ms: number
}

export function durationBucket(h: number | null): string {
  if (h === null) return '?'
  if (h <= 1.5) return 'short'
  if (h <= 3) return '2-3h'
  if (h <= 5) return '3-5h'
  if (h <= 10) return 'day'
  return `${Math.round(h)}h`
}

function fpCore(p: ParsedOffer): string {
  const i = p.inclusions
  return [i.transfer.value ?? '?', i.access.value, i.meals.value, [...(i.activities.value ?? [])].sort().join('+'), i.guide.value].join('|')
}

const TRANSFER_NAME = { none: '', shared: 'shared transfer', private: 'private transfer' }

export function variantName(inc: Variant['inclusions']): string {
  const parts: string[] = []
  const acts = inc.activities ?? []
  if (acts.length) parts.push(acts.map((a) => (a === 'two domes' ? 'two domes' : a)).join(', '))
  if (inc.meals === 'meal') parts.push('meal')
  if (inc.meals === 'fine') parts.push('fine dining')
  if (inc.meals === 'snack') parts.push('tastings')
  if (inc.access === 'fast-track') parts.push('express')
  if (inc.access === 'vip') parts.push('VIP')
  if (inc.guide === 'private') parts.push('private guide')
  if (inc.guide === 'group') parts.push('guided')
  if (inc.transfer && inc.transfer !== 'none') parts.push(TRANSFER_NAME[inc.transfer])
  if (inc.transfer === null) parts.push('transfer not stated')
  // the product itself first: activities name it, otherwise it is an admission
  if (!acts.length) parts.unshift('admission')
  const base = parts.join(' + ')
  return base.charAt(0).toUpperCase() + base.slice(1)
}

export function resolve(parsed: ParsedOffer[]): Resolution {
  const t0 = performance.now()
  const n = parsed.length
  const cores = parsed.map((p) => distinct(coreName(p.record.title)))
  const pairs: MatchPair[] = []
  const dsu = new DSU(n)
  let candidates = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // blocking: shared name token, or within 1.5 km, or a known alias
      const a = parsed[i].record
      const b = parsed[j].record
      const near = a.lat !== null && b.lat !== null && a.lon !== null && b.lon !== null && haversineM(a.lat, a.lon, b.lat, b.lon) < 1500
      if (!near && softOverlap(cores[i], cores[j]) === 0 && !kbSame(kbKey(parsed[i].record), kbKey(parsed[j].record))) continue
      candidates++
      const f = features(parsed[i], parsed[j], cores[i], cores[j])
      const score = matchScore(f)
      let decision: MatchPair['decision'] = 'apart'
      if (score >= AUTO) decision = 'auto'
      else if (score >= ARBITER) decision = arbiter(parsed[i], parsed[j], cores[i], cores[j], f).same ? 'arbiter-same' : 'arbiter-different'
      if (decision === 'auto' || decision === 'arbiter-same') dsu.union(i, j)
      pairs.push({ a: a.id, b: b.id, score, decision, features: { name: f.name, geo: f.geo ?? -1, category: 0, tokens: f.tokens } })
    }
  }

  // group records into entities
  const groups = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const r = dsu.find(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r)!.push(i)
  }

  const entities: Entity[] = []
  const entityOf = new Map<string, string>()
  const variantOf = new Map<string, string>()
  for (const idx of groups.values()) {
    const members = idx.map((i) => parsed[i])
    const reg = linkRegistry(idx.map((i) => cores[i]), members)
    const geo = members.filter((m) => m.record.lat !== null)
    const lat = geo.length ? geo.reduce((s, m) => s + m.record.lat!, 0) / geo.length : reg?.lat ?? 1.3
    const lon = geo.length ? geo.reduce((s, m) => s + m.record.lon!, 0) / geo.length : reg?.lon ?? 103.8
    const id = uniqueId(reg?.id ?? slug(cores[idx[0]].join(' ')), entities)
    const variants = buildVariants(id, members)
    for (const vr of variants) for (const o of vr.offers) variantOf.set(o.id, vr.id)
    for (const m of members) entityOf.set(m.record.id, id)
    const walkVotes = members.map((m) => m.walking).filter((w) => w.value !== null)
    const famVotes = members.map((m) => m.family).filter((w) => w.value !== null)
    entities.push({
      id,
      name: reg?.name ?? titleCase(cores[idx[0]].join(' ')),
      cluster: nearestCluster(lon, lat),
      lon,
      lat,
      category: reg?.category ?? 'tour',
      walking: walkVotes.length ? mode(walkVotes.map((w) => w.value!)) : null,
      family: famVotes.length ? mode(famVotes.map((w) => w.value!)) : null,
      relaxing: reg?.relaxing ?? false,
      variants,
      records: members.length,
      photo: reg?.photo,
      contentScore: Math.min(1, 0.35 + (reg?.photo ? 0.25 : 0) + (geo.length ? 0.2 : 0) + Math.min(0.2, members.reduce((s, m) => s + m.record.description.length, 0) / members.length / 600)),
    })
  }
  entities.sort((a, b) => b.records - a.records)
  return { entities, pairs, candidatePairs: candidates, totalPairs: (n * (n - 1)) / 2, entityOf, variantOf, ms: performance.now() - t0 }
}

function buildVariants(entityId: string, members: ParsedOffer[]): Variant[] {
  // pass 1: group by inclusions except duration
  const byCore = new Map<string, ParsedOffer[]>()
  for (const m of members) {
    const k = fpCore(m)
    if (!byCore.has(k)) byCore.set(k, [])
    byCore.get(k)!.push(m)
  }
  const out: Variant[] = []
  for (const [k, list] of byCore) {
    // pass 2: split by duration bucket only when sources disagree; unknown durations join the single known bucket
    const known = new Set(list.map((m) => durationBucket(m.inclusions.durationH.value)).filter((b) => b !== '?'))
    const buckets = new Map<string, ParsedOffer[]>()
    for (const m of list) {
      let b = durationBucket(m.inclusions.durationH.value)
      if (b === '?' && known.size === 1) b = [...known][0]
      if (!buckets.has(b)) buckets.set(b, [])
      buckets.get(b)!.push(m)
    }
    for (const [b, offersP] of buckets) {
      const first = offersP[0].inclusions
      const durs = offersP.map((m) => m.inclusions.durationH.value).filter((d): d is number => d !== null)
      const inclusions: { [K in keyof Inclusions]: Inclusions[K] | null } = {
        transfer: first.transfer.value,
        access: first.access.value,
        meals: first.meals.value,
        activities: first.activities.value,
        durationH: durs.length ? durs[0] : null,
        guide: first.guide.value,
      }
      const id = `${entityId}~${slug(k + '|' + b)}`
      const offers: Offer[] = offersP.map((m) => ({
        id: m.record.id,
        parsed: m,
        supplier: m.record.supplier,
        priceINR: m.priceINR,
        cancelH: m.cancelH.value,
        availability: m.record.availability,
        checkedAt: m.record.checkedAt,
      }))
      out.push({ id, entityId, name: variantName(inclusions), fingerprint: `${k}|${b}`, inclusions, offers })
    }
  }
  out.sort((a, b) => Math.min(...a.offers.map((o) => o.priceINR)) - Math.min(...b.offers.map((o) => o.priceINR)))
  return out
}

/** Link a resolved group to the POI registry (names and coordinates only, no labels). */
function linkRegistry(cores: string[][], members: ParsedOffer[]) {
  const geo = members.filter((m) => m.record.lat !== null)
  const lat = geo.length ? geo.reduce((s, m) => s + m.record.lat!, 0) / geo.length : null
  const lon = geo.length ? geo.reduce((s, m) => s + m.record.lon!, 0) / geo.length : null
  let best: (typeof CATALOG)[number] | null = null
  let bestScore = 0
  for (const e of CATALOG) {
    const reg = tokens(e.name).filter((t) => t !== 'singapore')
    let nameScore = 0
    for (const c of cores) {
      const ov = softOverlap(c, reg)
      nameScore = Math.max(nameScore, ov / Math.max(1, Math.min(c.length, reg.length)), 0.8 * jaroWinkler(c.join(' '), reg.join(' ')))
    }
    const kb = cores.some((c) => kbSame(c.join(' '), reg.join(' ')))
    const geoScore = lat !== null && lon !== null ? Math.max(0, 1 - haversineM(lat, lon, e.lat, e.lon) / 1200) : 0.4
    const s = (kb ? 1 : nameScore) * 0.7 + geoScore * 0.3
    if (s > bestScore) {
      bestScore = s
      best = e
    }
  }
  return bestScore >= 0.6 ? best : null
}

function nearestCluster(lon: number, lat: number): string {
  let best = CLUSTERS[0].id
  let d = Infinity
  for (const c of CLUSTERS) {
    const x = haversineM(lat, lon, c.lat, c.lon)
    if (x < d) {
      d = x
      best = c.id
    }
  }
  return best
}

function mode<T>(a: T[]): T {
  const m = new Map<T, number>()
  for (const x of a) m.set(x, (m.get(x) ?? 0) + 1)
  return [...m.entries()].sort((x, y) => y[1] - x[1])[0][0]
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())
function uniqueId(id: string, existing: Entity[]): string {
  let k = id
  let i = 2
  while (existing.some((e) => e.id === k)) k = `${id}-${i++}`
  return k
}
