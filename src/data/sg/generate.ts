import type { CatalogEntity, CatalogVariant, RawRecord, Walking } from '../../engine/types'
import { CATALOG } from './catalog'

// Deterministic, labelled synthetic supplier feed for Singapore sightseeing.
// Each supplier writes in its own style (abbreviations, missing fields, currencies, traps
// such as "optional transfer at extra cost") so matching and parsing are not trivial.

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const FX = { INR: 1, SGD: 64.5, USD: 84.2 } as const

const SIGHTSEEING_SUPPLIERS = ['halo', 'sandline', 'corvid', 'atlas', 'meridian', 'nomad', 'tide'] as const
type S = (typeof SIGHTSEEING_SUPPLIERS)[number]

const BASE_INR: Record<string, number> = {
  'night-safari': 3480, zoo: 3150, 'river-wonders': 2590, 'bird-paradise': 3080, uss: 5590, 'sea-aquarium': 2860,
  'cable-car': 2390, luge: 1990, wings: 1290, gardens: 2380, skypark: 2060, flyer: 2590, 'river-cruise': 1680,
  'hop-on': 2950, 'chinatown-walk': 5150, jewel: 1240, 'science-centre': 1270, ubin: 6100, 'east-coast': 1150,
  kranji: 5400, islands: 1150,
}

function priceOf(e: CatalogEntity, vr: CatalogVariant) {
  let p = BASE_INR[e.id] ?? 2500
  if (vr.transfer === 'shared') p += 1120
  if (vr.transfer === 'private') p += 3650
  if (vr.meals === 'meal') p += 1880
  if (vr.meals === 'fine') p += 6400
  if (vr.meals === 'snack') p += 300
  if (vr.access === 'fast-track') p += 3050
  if (vr.access === 'vip') p += 2750
  if (vr.guide === 'private') p += 2400
  p += vr.activities.length * 420
  return p
}

const SUPPLIER_TERMS: Record<S, { markup: number; currency: 'INR' | 'SGD' | 'USD'; cancel: (r: () => number, vr: CatalogVariant) => [string, number | null] }> = {
  halo: { markup: 1.0, currency: 'INR', cancel: () => ['Free cancellation up to 24 hours before the experience starts.', 24] },
  sandline: {
    markup: 0.97, currency: 'SGD',
    cancel: (_r, vr) => (vr.meals !== 'none' ? ['Non-refundable once confirmed.', 0] : ['Cancel 48 hrs prior to travel for a full refund.', 48]),
  },
  corvid: { markup: 0.93, currency: 'USD', cancel: (r) => (r() < 0.7 ? ['NON REFUNDABLE', 0] : ['Free cxl until 24h before', 24]) },
  atlas: { markup: 1.02, currency: 'INR', cancel: () => ['Free cancellation until 24 hours prior to service date.', 24] },
  meridian: { markup: 1.04, currency: 'INR', cancel: () => ['Fully refundable if cancelled 72 hours or more before the activity date.', 72] },
  nomad: { markup: 0.96, currency: 'USD', cancel: (r) => (r() < 0.5 ? ['', null] : ['Refunds per supplier policy.', null]) },
  tide: { markup: 0.99, currency: 'SGD', cancel: () => ['50% refund if cancelled 24 hours before; no refund after.', 0] },
}

const pick = <T,>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)]

/** Fisher-Yates, so the dataset is identical in every browser. */
function shuffle<T>(a: T[], r: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function transferPhrase(s: S, vr: CatalogVariant, r: () => number): string {
  if (vr.transfer === 'shared') {
    return ({
      halo: pick(r, ['with round-trip hotel transfers', 'with hotel pick-up and drop-off']),
      sandline: pick(r, ['Tour with Hotel Pickup', 'with return transfer from central hotels']),
      corvid: pick(r, ['W/ SIC TRF', 'INCL RT SIC TRANSFER']),
      atlas: 'Seat-in-coach transfer from central hotels',
      meridian: 'SIC',
      nomad: pick(r, ['+ shuttle', 'with shared transfer']),
      tide: 'incl. return transfers',
    } as Record<S, string>)[s]
  }
  if (vr.transfer === 'private') {
    return ({
      halo: 'with private car transfers', sandline: 'Private Tour with Hotel Pickup', corvid: 'W/ PVT TRF', atlas: 'Private transfer included',
      meridian: 'PVT', nomad: 'private pickup', tide: 'incl. private chauffeur',
    } as Record<S, string>)[s]
  }
  return ({
    halo: pick(r, ['ticket only', 'admission ticket']), sandline: 'Ticket', corvid: 'ADM ONLY', atlas: 'Ticket only', meridian: 'Ticket only',
    nomad: 'e-ticket', tide: 'entry ticket',
  } as Record<S, string>)[s]
}

const ACT_WORDS: Record<string, string[]> = {
  tram: ['tram ride', 'tram'], 'boat ride': ['boat ride', 'river boat ride'], skyway: ['OCBC Skyway'], 'two domes': ['Flower Dome and Cloud Forest', '2 domes'],
  'snow city': ['Snow City'], 'luge x3': ['3 luge rides', '3x luge'], skyride: ['Skyride'], 'canopy bridge': ['Canopy Bridge'], 'hedge maze': ['Hedge Maze'],
  bike: ['bicycle', 'bike'], bumboat: ['bumboat crossing'], 'farm visit': ['farm visits'], ferry: ['ferry'],
}

function extrasWords(vr: CatalogVariant, r: () => number, abbrev: boolean): string[] {
  const out: string[] = []
  for (const a of vr.activities) out.push(abbrev ? pick(r, ACT_WORDS[a] ?? [a]).toUpperCase() : pick(r, ACT_WORDS[a] ?? [a]))
  if (vr.meals === 'meal') out.push(abbrev ? 'MEAL' : pick(r, ['buffet dinner', 'meal included', 'dinner']))
  if (vr.meals === 'fine') out.push(abbrev ? 'SKY DINING' : pick(r, ['sky dining', '4-course dinner']))
  if (vr.meals === 'snack') out.push(abbrev ? 'TASTINGS' : 'tastings')
  if (vr.access === 'fast-track') out.push(abbrev ? 'EXPRESS' : pick(r, ['Express Pass', 'skip-the-line']))
  if (vr.access === 'vip') out.push(abbrev ? 'VIP' : pick(r, ['VIP', 'premium seating']))
  if (vr.guide === 'private') out.push(abbrev ? 'PVT GUIDE' : 'private guide')
  if (vr.guide === 'group') out.push(abbrev ? 'GUIDED' : 'small-group guided')
  return out
}

const WALK_TEXT: Record<Walking, string[]> = {
  low: ['Suitable for all fitness levels; minimal walking.', 'Seated experience, very little walking.'],
  moderate: ['Involves moderate walking (about 2 km).', 'Some walking on paved paths.'],
  high: ['Involves 4 to 6 km of walking.', 'Requires a good level of fitness; lots of walking.'],
}

function describe(s: S, e: CatalogEntity, vr: CatalogVariant, r: () => number): { title: string; description: string; duration: string | null; language: string | null } {
  const alias = pick(r, [e.name, ...e.aliases])
  const extras = extrasWords(vr, r, s === 'corvid')
  const tr = transferPhrase(s, vr, r)
  const parts: string[] = []
  let title = ''
  switch (s) {
    case 'halo':
      title = `${alias}: ${[...extras, tr].filter(Boolean).join(', ')}`
      break
    case 'sandline':
      title = vr.transfer === 'none' ? `${alias} ${tr}${extras.length ? ' with ' + extras.join(' and ') : ''}` : `${alias} ${tr}${extras.length ? ', ' + extras.join(', ') : ''}`
      break
    case 'corvid':
      title = `${alias.toUpperCase()} ${[...extras.map((x) => '+ ' + x), tr].join(' ')}`
      break
    case 'atlas':
      title = `Singapore - ${alias} (${vr.name})`
      break
    case 'meridian':
      title = `${e.name} | ${vr.name} | ${tr}`
      break
    case 'nomad':
      title = `${alias} ${extras.length ? extras.join(' + ') + ' ' : ''}${tr}`
      break
    case 'tide':
      title = `${alias} Experience ${extras.length ? 'incl. ' + extras.join(', ') + ' ' : ''}${vr.transfer !== 'none' ? tr : ''}`.trim()
      break
  }
  // description
  if (s === 'atlas') parts.push(`Transfer: ${vr.transfer === 'none' ? 'Not included' : tr}.`)
  if (s === 'halo' || s === 'tide') parts.push(`Includes: ${[...extras, vr.transfer !== 'none' ? tr : 'admission'].join(', ')}.`)
  // traps: optional extras that are NOT included
  if (vr.transfer === 'none' && r() < 0.35) parts.push(pick(r, ['Optional hotel transfer available at extra cost.', 'Transfers can be added for a fee.', 'Hotel pick-up not included.']))
  if (vr.meals === 'none' && (e.category === 'wildlife' || e.category === 'show') && r() < 0.35) parts.push(pick(r, ['Dinner not included.', 'Meals are not included; restaurants on site.']))
  // walking: only some suppliers state it, and only when the source knows
  if (e.walking && (s === 'halo' || s === 'atlas' || (s === 'sandline' && r() < 0.5))) parts.push(pick(r, WALK_TEXT[e.walking]))
  if (s === 'halo' || s === 'meridian') parts.push(e.family ? 'Suitable for families with children.' : 'Not recommended for children under 12.')
  if (vr.guide === 'group' || vr.guide === 'private') parts.push('Live guide in English.')
  const duration = s === 'nomad' && r() < 0.6 ? null : pick(r, [`Approx. ${vr.durationH} hours`, `${vr.durationH}h`, `Duration: ${vr.durationH} hrs`])
  const language = vr.guide === 'group' || vr.guide === 'private' ? 'English' : null
  return { title: title.replace(/\s+/g, ' ').trim(), description: parts.join(' '), duration, language }
}

export function generateRecords(seed = 20261115, now = Date.now()): RawRecord[] {
  const r = mulberry32(seed)
  const out: RawRecord[] = []
  let n = 0
  for (const e of CATALOG) {
    for (const vr of e.variants) {
      // 2 to 6 suppliers sell each variant; private and dining variants have fewer sellers
      const k = vr.transfer === 'private' || vr.meals === 'fine' ? 2 + Math.floor(r() * 2) : 3 + Math.floor(r() * 4)
      const pool = shuffle([...SIGHTSEEING_SUPPLIERS], r).slice(0, k)
      for (const s of pool) {
        const t = SUPPLIER_TERMS[s]
        const d = describe(s, e, vr, r)
        const [cancelText, cancelH] = t.cancel(r, vr)
        const inr = priceOf(e, vr) * t.markup * (0.96 + r() * 0.1)
        const amount = inr / FX[t.currency]
        const price = t.currency === 'INR' ? `INR ${Math.round(amount / 10) * 10}` : `${t.currency} ${amount.toFixed(2)}`
        const jitter = () => (r() - 0.5) * 0.003
        const hasGeo = s !== 'corvid' && !(s === 'nomad' && r() < 0.5)
        const avail = s === 'sandline' && vr.transfer === 'private' ? 'on-request' : r() < 0.04 ? 'sold-out' : 'instant'
        n++
        out.push({
          id: `r${String(n).padStart(3, '0')}`,
          supplier: s,
          supplierCode: `${s.slice(0, 3).toUpperCase()}-${Math.floor(10000 + r() * 89999)}`,
          title: d.title,
          description: d.description,
          cancellation: cancelText,
          priceText: price,
          currency: t.currency,
          lon: hasGeo ? e.lon + jitter() : null,
          lat: hasGeo ? e.lat + jitter() : null,
          durationText: d.duration,
          language: d.language,
          availability: avail,
          checkedAt: now - Math.floor(r() * 95) * 60_000 - Math.floor(r() * 60) * 1000,
          truth: { entity: e.id, variant: vr.id, cancelH, walking: e.walking },
        })
      }
    }
  }
  return out
}
