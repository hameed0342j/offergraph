import { FX } from '../data/sg/generate'
import { generateHotels, HOTELS, type HotelRecord, type RoomRecord } from '../data/sg/hotels'
import { SUPPLIER_BY_ID, reliabilityScore } from '../data/suppliers'
import { haversineM, jaroWinkler, tokens } from './text'

// Hotels: property equivalence (with a review queue for unresolved look-alikes), room-string
// normalisation into a canonical room key, golden-record content and supplier selection per room.

export interface RoomKey {
  cls: string
  bed: string
  view: string
  board: 'RO' | 'BB'
  refundable: boolean
}

export interface RoomOffer {
  rec: RoomRecord
  supplier: string
  priceINR: number
  available: number
  cancelDays: number | null // null = non-refundable
  key: RoomKey
}

export interface RoomGroup {
  key: RoomKey
  label: string
  offers: RoomOffer[]
  best: RoomOffer
  reasons: string[]
}

export interface Property {
  id: string
  name: string
  stars: number
  lon: number
  lat: number
  address: string
  amenities: { name: string; sources: number }[]
  image: { url: string; w: number; h: number; watermark: boolean; supplier: string; why: string }
  images: { url: string; w: number; h: number; watermark: boolean; supplier: string }[]
  records: HotelRecord[]
  names: string[]
  rooms: RoomGroup[]
  confidence: number
  from: number
}

export interface PairDecision {
  a: string
  b: string
  score: number
  decision: 'auto' | 'arbiter-same' | 'arbiter-different' | 'review' | 'apart'
  reason: string
  features: { name: number; distanceM: number | null; stars: number; postcode: boolean | null; phone: boolean | null }
}

const GENERIC = new Set(tokens('hotel hotels singapore sg the resort by far east airport'))
const BRAND = new Set(tokens('pan pacific jen ibis crowne plaza yotel swissotel shangri la village'))

const core = (name: string) => tokens(name.replace(/ô/g, 'o').replace(/-/g, ' ')).filter((t) => !GENERIC.has(t))

// ---- room strings ------------------------------------------------------------------------

export function parseRoom(raw: string): RoomKey {
  const t = raw.toLowerCase()
  const cls = /\bfamily\b/.test(t) ? 'Family' : /\b(club|executive)\b/.test(t) ? 'Club' : /\bprem(ier)?\b/.test(t) ? 'Premier' : /\b(dlx|deluxe)\b/.test(t) ? 'Deluxe' : /\bsuite\b/.test(t) ? 'Suite' : 'Standard'
  const bed = /\b(2 queen|2 qn|two queen)/.test(t) ? 'Queen x2' : /\b(twin|twn|2 single)/.test(t) ? 'Twin' : 'King'
  const view = /\b(bay view|marina bay view|bay vw)\b/.test(t) ? 'Bay' : /\b(city view|city vw|city-view)\b/.test(t) ? 'City' : /\b(garden view|grdn vw|pool or garden view)\b/.test(t) ? 'Garden' : 'None'
  const board = /\b(bb|breakfast|bed & breakfast)\b/.test(t) && !/\bno meals\b/.test(t) ? 'BB' : 'RO'
  const refundable = !/\b(nrf|non-refundable|advance purchase)\b/.test(t)
  return { cls, bed, view, board, refundable }
}

export function roomLabel(k: RoomKey): string {
  const view = k.view === 'None' ? '' : `, ${k.view.toLowerCase()} view`
  const bed = k.bed === 'Queen x2' ? '2 queen beds' : k.bed === 'Twin' ? 'twin beds' : 'king bed'
  return `${k.cls}, ${bed}${view}`
}

const keyStr = (k: RoomKey) => `${k.cls}|${k.bed}|${k.view}|${k.board}|${k.refundable}`

function cancelDays(text: string): number | null {
  const t = text.toLowerCase()
  if (/\bnrf\b|non-refundable/.test(t)) return null
  const m = /(\d+)\s*(d\b|days?)/.exec(t)
  return m ? parseInt(m[1], 10) : null
}

const priceINR = (r: RoomRecord) => Math.round(parseFloat(r.priceText.replace(/[^\d.]/g, '')) * FX[r.currency])

// ---- property matching ---------------------------------------------------------------------

function features(a: HotelRecord, b: HotelRecord) {
  const ca = core(a.name)
  const cb = core(b.name)
  const ov = ca.filter((x) => cb.includes(x)).length
  const jac = ov / Math.max(1, new Set([...ca, ...cb]).size)
  const contain = ov / Math.max(1, Math.min(ca.length, cb.length))
  const name = Math.max(jac, 0.9 * contain, 0.75 * jaroWinkler(ca.join(' '), cb.join(' ')))
  const distanceM = a.lat !== null && b.lat !== null && a.lon !== null && b.lon !== null ? haversineM(a.lat, a.lon, b.lat, b.lon) : null
  return {
    name,
    distanceM,
    stars: Math.abs(a.stars - b.stars),
    postcode: a.postcode && b.postcode ? a.postcode === b.postcode : null,
    phone: a.phone && b.phone ? a.phone === b.phone : null,
    ca,
    cb,
  }
}

function score(f: ReturnType<typeof features>): number {
  const geo = f.distanceM === null ? 0.5 : f.distanceM <= 150 ? 1 : f.distanceM >= 1200 ? 0 : 1 - (f.distanceM - 150) / 1050
  const z = -6.2 + 6.5 * f.name + 3.2 * geo - 1.5 * f.stars + (f.postcode === true ? 1.5 : f.postcode === false ? -2.5 : 0) + (f.phone === true ? 1.5 : f.phone === false ? -2.5 : 0)
  return 1 / (1 + Math.exp(-z))
}

/** grey-zone arbiter (an LLM in production; rules offline, labelled as such) */
function arbiter(f: ReturnType<typeof features>): { d: PairDecision['decision']; reason: string } {
  if (f.postcode === false) return { d: 'arbiter-different', reason: 'Different postcodes' }
  if (f.phone === false) return { d: 'arbiter-different', reason: 'Different phone numbers' }
  if (f.distanceM !== null && f.distanceM > 600) return { d: 'arbiter-different', reason: `${(f.distanceM / 1000).toFixed(1)} km apart` }
  const da = f.ca.filter((t) => !BRAND.has(t))
  const db = f.cb.filter((t) => !BRAND.has(t))
  if (da.length && db.length && !da.some((t) => db.includes(t))) return { d: 'arbiter-different', reason: `Same brand, different property (${da.join(' ')} vs ${db.join(' ')})` }
  if (f.postcode === true || f.phone === true) return { d: 'arbiter-same', reason: 'Same postcode or phone' }
  if (f.distanceM !== null && f.distanceM < 200) return { d: 'arbiter-same', reason: 'Same location, matching name' }
  return { d: 'review', reason: 'Not enough evidence: sent to the review queue' }
}

export interface HotelResolution {
  properties: Property[]
  pairs: PairDecision[]
  review: PairDecision[]
  records: HotelRecord[]
  rawRooms: number
  ms: number
  eval: { propertyP: number; propertyR: number; roomAccuracy: number; roomGroups: number }
}

export function resolveHotels(): HotelResolution {
  const t0 = performance.now()
  const recs = generateHotels()
  const n = recs.length
  const parent = recs.map((_, i) => i)
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])))
  const pairs: PairDecision[] = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const f = features(recs[i], recs[j])
      if (f.name < 0.3 && (f.distanceM === null || f.distanceM > 1500)) continue // blocking
      const s = score(f)
      let d: PairDecision['decision'] = 'apart'
      let reason = 'Low match score'
      const brandOnly = f.ca.every((t) => BRAND.has(t)) || f.cb.every((t) => BRAND.has(t))
      const noHardEvidence = f.postcode !== true && f.phone !== true && f.distanceM === null
      if (s >= 0.45 && brandOnly && noHardEvidence) {
        d = 'review'
        reason = 'Only the brand name matches and there is no address evidence'
      } else if (s >= 0.85) {
        d = 'auto'
        reason = 'High confidence'
        // hard evidence still vetoes an auto-merge
        if (f.postcode === false || f.phone === false) {
          d = 'arbiter-different'
          reason = f.postcode === false ? 'Different postcodes' : 'Different phone numbers'
        }
      } else if (s >= 0.45) ({ d, reason } = arbiter(f))
      if (d === 'auto' || d === 'arbiter-same') parent[find(i)] = find(j)
      pairs.push({ a: recs[i].id, b: recs[j].id, score: s, decision: d, reason, features: { name: f.name, distanceM: f.distanceM, stars: f.stars, postcode: f.postcode, phone: f.phone } })
    }
  }
  const groups = new Map<number, HotelRecord[]>()
  recs.forEach((r, i) => {
    const g = find(i)
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(r)
  })

  let rawRooms = 0
  let roomOk = 0
  const properties: Property[] = []
  for (const members of groups.values()) {
    const names = members.map((m) => m.name)
    const name = [...names].sort((a, b) => score2(b) - score2(a))[0]
    const geo = members.filter((m) => m.lat !== null)
    const lat = geo.length ? geo.reduce((s, m) => s + m.lat!, 0) / geo.length : 1.3
    const lon = geo.length ? geo.reduce((s, m) => s + m.lon!, 0) / geo.length : 103.85
    const starVotes = members.map((m) => m.stars).sort((a, b) => b - a)
    const amen = new Map<string, number>()
    for (const m of members) for (const a of m.amenities) amen.set(a, (amen.get(a) ?? 0) + 1)
    const images = members.flatMap((m) => m.images.map((im) => ({ ...im, supplier: m.supplier })))
    const imgScore = (im: (typeof images)[number]) => (im.w * im.h) / 1e6 - (im.watermark ? 3 : 0)
    const best = [...images].sort((a, b) => imgScore(b) - imgScore(a))[0]
    const rejected = images.filter((im) => im !== best)
    const why = `${best.w}×${best.h}, ${best.watermark ? 'watermarked' : 'no watermark'}; ${rejected.length} other image${rejected.length === 1 ? '' : 's'} ${rejected.some((r) => r.watermark) ? 'watermarked or ' : ''}smaller`

    // rooms
    const byKey = new Map<string, RoomOffer[]>()
    for (const m of members) {
      for (const r of m.rooms) {
        rawRooms++
        const key = parseRoom(r.raw)
        const truth = HOTELS.find((h) => h.id === m.truth.hotel)!.rooms.find((x) => x.id === r.truth.room)!
        if (key.cls === truth.cls && key.bed === truth.bed && key.view === truth.view && key.board === r.truth.board && key.refundable === r.truth.refundable) roomOk++
        const k = keyStr(key)
        if (!byKey.has(k)) byKey.set(k, [])
        byKey.get(k)!.push({ rec: r, supplier: m.supplier, priceINR: priceINR(r), available: r.available, cancelDays: cancelDays(r.cancel), key })
      }
    }
    const rooms: RoomGroup[] = [...byKey.values()].map((offers) => {
      const med = [...offers].sort((a, b) => a.priceINR - b.priceINR)[Math.floor((offers.length - 1) / 2)].priceINR
      const sc = (o: RoomOffer) => {
        const s = SUPPLIER_BY_ID[o.supplier]
        const price = Math.max(0, Math.min(1, 0.5 + ((med - o.priceINR) / med) * 4))
        const rel = reliabilityScore(s) / 100
        const avail = o.available > 0 ? 1 : 0.3
        const pay = s.payment.startsWith('Agent credit') ? 1 : s.payment === 'Pay at hotel' ? 0.85 : 0.5
        const canc = o.cancelDays === null ? 0.2 : Math.min(1, 0.5 + o.cancelDays / 6)
        return 0.4 * price + 0.25 * rel + 0.15 * avail + 0.1 * pay + 0.1 * canc
      }
      const sorted = [...offers].sort((a, b) => sc(b) - sc(a))
      const b = sorted[0]
      const cheapest = [...offers].sort((a, c) => a.priceINR - c.priceINR)[0]
      const sup = SUPPLIER_BY_ID[b.supplier]
      const reasons = [
        b === cheapest ? 'Lowest price for this exact room and policy' : `₹${(b.priceINR - cheapest.priceINR).toLocaleString('en-IN')} above the cheapest, chosen for reliability`,
        `${sup.name}: ${(sup.instantConfirm * 100).toFixed(1)}% instant confirmation, ${(sup.priceJump * 100).toFixed(1)}% price jumps`,
        b.available > 0 ? `${b.available} room${b.available > 1 ? 's' : ''} left, instant` : 'On request',
        sup.payment,
      ]
      return { key: b.key, label: roomLabel(b.key), offers: sorted, best: b, reasons }
    })
    rooms.sort((a, b) => a.best.priceINR - b.best.priceINR)
    const internal = pairs.filter((p) => members.some((m) => m.id === p.a) && members.some((m) => m.id === p.b) && (p.decision === 'auto' || p.decision === 'arbiter-same'))
    properties.push({
      id: members[0].truth.hotel + '-' + members[0].id,
      name,
      stars: starVotes[Math.floor(starVotes.length / 2)],
      lon,
      lat,
      address: members.map((m) => m.address).sort((a, b) => b.length - a.length)[0],
      amenities: [...amen.entries()].map(([name, sources]) => ({ name, sources })).sort((a, b) => b.sources - a.sources),
      image: { ...best, why },
      images,
      records: members,
      names: [...new Set(names)],
      rooms,
      confidence: internal.length ? Math.min(...internal.map((p) => p.score)) : 1,
      from: rooms.length ? Math.min(...rooms.map((r) => r.best.priceINR)) : 0,
    })
  }
  properties.sort((a, b) => b.records.length - a.records.length || a.from - b.from)

  // evaluation against labels
  let tp = 0
  let fp = 0
  let fn = 0
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const same = recs[i].truth.hotel === recs[j].truth.hotel
      const pred = find(i) === find(j)
      if (same && pred) tp++
      else if (!same && pred) fp++
      else if (same && !pred) fn++
    }
  return {
    properties,
    pairs,
    // only pairs the evidence could not settle, directly or through other links
    review: pairs.filter((p) => p.decision === 'review' && find(recs.findIndex((r) => r.id === p.a)) !== find(recs.findIndex((r) => r.id === p.b))),
    records: recs,
    rawRooms,
    ms: performance.now() - t0,
    eval: { propertyP: tp / Math.max(1, tp + fp), propertyR: tp / Math.max(1, tp + fn), roomAccuracy: roomOk / Math.max(1, rawRooms), roomGroups: properties.reduce((s, p) => s + p.rooms.length, 0) },
  }
}

/** prefer a clean, title-cased full name for the golden record */
function score2(n: string): number {
  return (n === n.toUpperCase() ? -5 : 0) + n.length / 10 + (/singapore/i.test(n) ? 0.5 : 0)
}
