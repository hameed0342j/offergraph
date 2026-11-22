// Vercel Function: live things-to-do from Viator (Partner API v2, affiliate access) for any destination it covers,
// India first. The browser sends the structured request; this resolves the destination, applies the hard filters
// Viator supports natively, and returns normalised products. Redis caches the destination index for 7 days and each
// search for 10 minutes, so a busy demo stays inside the partner rate limits and repeat searches are instant.
import { caller, redis, sha } from './_lib/redis.js'

const BASE = process.env.VIATOR_BASE_URL || 'https://api.viator.com/partner'
const headers = () => ({
  'exp-api-key': process.env.VIATOR_API_KEY ?? '',
  Accept: 'application/json;version=2.0',
  'Accept-Language': 'en-US',
  'Content-Type': 'application/json',
})

interface Dest {
  id: number
  name: string
  type: string
  country: string | null
  lat: number | null
  lng: number | null
}

// common spellings that differ from Viator's destination names
const ALIAS: Record<string, string> = {
  delhi: 'new delhi',
  bengaluru: 'bangalore',
  bombay: 'mumbai',
  calcutta: 'kolkata',
  cochin: 'kochi',
  andaman: 'andaman and nicobar islands',
  'andaman islands': 'andaman and nicobar islands',
  ooty: 'ooty (udhagamandalam)',
  pondy: 'pondicherry',
  puducherry: 'pondicherry',
  benares: 'varanasi',
  kashmir: 'srinagar',
  ladakh: 'leh',
}
const INDIA = 723
const TYPE_RANK: Record<string, number> = { CITY: 0, STATE: 1, REGION: 2, COUNTRY: 3 }

let memo: Map<string, Dest> | null = null
let memoPaths: Map<string, string> | null = null // destination id -> lookupId ("2.723.4594")

/** lookupId path for each destination id, so results can be kept to the searched place and its children. */
async function pathsFor(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!ids.length) return out
  if (!memoPaths) {
    const db = redis()
    if (db) {
      try {
        const res = await db.hmget<Record<string, string>>('og:viator:path', ...ids)
        if (res && Object.values(res).some(Boolean)) {
          for (const [k, v] of Object.entries(res)) if (v) out.set(k, String(v))
          return out
        }
      } catch (error) {
        console.warn('path cache read failed', error)
      }
    }
    await buildIndex()
  }
  for (const id of ids) {
    const v = memoPaths?.get(id)
    if (v) out.set(id, v)
  }
  return out
}

/** Look a destination up by name: warm memory, then one Redis HGET, then (cold) the full Viator list. */
async function findDestination(names: string[]): Promise<Dest | null> {
  if (memo) return names.map((n) => memo!.get(n)).find(Boolean) ?? null
  const db = redis()
  if (db) {
    try {
      const p = db.pipeline()
      for (const n of names) p.hget('og:viator:dest', n)
      p.hlen('og:viator:dest')
      const res = await p.exec<(Dest | number | null)[]>()
      if (Number(res[res.length - 1]) > 100) return (res.slice(0, -1).find(Boolean) as Dest | undefined) ?? null
    } catch (error) {
      console.warn('dest cache read failed', error)
    }
  }
  const index = await buildIndex()
  return names.map((n) => index.get(n)).find(Boolean) ?? null
}

/** name -> destination, preferring India when a name is shared (Kochi is also in Japan), then cities. */
async function buildIndex(): Promise<Map<string, Dest>> {
  const db = redis()
  const r = await fetch(`${BASE}/destinations`, { headers: headers(), signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error(`viator destinations ${r.status}`)
  const all = ((await r.json()) as { destinations: { destinationId: number; name: string; type: string; lookupId: string; center?: { latitude: number; longitude: number } }[] }).destinations
  const byId = new Map(all.map((d) => [d.destinationId, d]))
  const paths = new Map(all.map((d) => [String(d.destinationId), d.lookupId]))
  const index = new Map<string, Dest>()
  const score = (d: Dest, path: number[]) => (path.includes(INDIA) ? 0 : 10) + (TYPE_RANK[d.type] ?? 5)
  const best = new Map<string, number>()
  for (const d of all) {
    const path = d.lookupId.split('.').map(Number)
    const country = path.map((id) => byId.get(id)).find((x) => x?.type === 'COUNTRY')?.name ?? null
    const v: Dest = { id: d.destinationId, name: d.name, type: d.type, country, lat: d.center?.latitude ?? null, lng: d.center?.longitude ?? null }
    const key = d.name.toLowerCase()
    const s = score(v, path)
    if (!best.has(key) || s < best.get(key)!) {
      best.set(key, s)
      index.set(key, v)
    }
  }
  if (db) {
    try {
      await db
        .pipeline()
        .hset('og:viator:dest', Object.fromEntries(index))
        .expire('og:viator:dest', 7 * 86400)
        .hset('og:viator:path', Object.fromEntries(paths))
        .expire('og:viator:path', 7 * 86400)
        .exec()
    } catch (error) {
      console.warn('dest cache write failed', error)
    }
  }
  memoPaths = paths
  return (memo = index)
}

interface ViatorProduct {
  productCode: string
  title: string
  description?: string
  productUrl?: string
  images?: { isCover?: boolean; variants?: { url: string; width: number; height: number }[] }[]
  reviews?: { totalReviews?: number; combinedAverageRating?: number }
  duration?: { fixedDurationInMinutes?: number; variableDurationFromMinutes?: number; variableDurationToMinutes?: number }
  pricing?: { summary?: { fromPrice?: number; fromPriceBeforeDiscount?: number }; currency?: string }
  flags?: string[]
  confirmationType?: string
  destinations?: { ref: string; primary?: boolean }[]
}

/** Structured facts from the product detail record (pickup, fitness, accessibility, meals, operator). */
interface Detail {
  pickupType: 'everyone' | 'optional' | 'meet' | null
  fitness: 'easy' | 'medium' | 'hard' | null
  stroller: boolean
  wheelchair: boolean
  meals: string[]
  operator: string | null
}

interface ViatorDetail {
  logistics?: { travelerPickup?: { pickupOptionType?: string } }
  additionalInfo?: { type?: string }[]
  inclusions?: { category?: string; type?: string; typeDescription?: string }[]
  supplier?: { name?: string }
}

function toDetail(j: ViatorDetail): Detail {
  const pick = j.logistics?.travelerPickup?.pickupOptionType
  const info = (j.additionalInfo ?? []).map((a) => a.type)
  return {
    pickupType: pick === 'PICKUP_EVERYONE' ? 'everyone' : pick === 'PICKUP_AND_MEET_AT_START_POINT' ? 'optional' : pick === 'MEET_EVERYONE_AT_START_POINT' ? 'meet' : null,
    fitness: info.includes('PHYSICAL_EASY') ? 'easy' : info.includes('PHYSICAL_MEDIUM') ? 'medium' : info.includes('PHYSICAL_HARD') ? 'hard' : null,
    stroller: info.includes('STROLLER_ACCESSIBLE'),
    wheelchair: info.includes('WHEELCHAIR_ACCESSIBLE'),
    meals: (j.inclusions ?? []).filter((x) => x.category === 'FOOD_AND_DRINK' && /BREAKFAST|LUNCH|DINNER|MEAL/.test(x.type ?? '')).map((x) => (x.typeDescription ?? x.type ?? '').toLowerCase()),
    operator: j.supplier?.name ?? null,
  }
}

/** Detail records for the leading products: Redis first (24 h), then Viator in parallel; failures stay unknown. */
async function details(codes: string[]): Promise<Map<string, Detail>> {
  const out = new Map<string, Detail>()
  const db = redis()
  let missing = codes
  if (db && codes.length) {
    try {
      const p = db.pipeline()
      for (const c of codes) p.get(`og:viator:product:${c}`)
      const res = await p.exec<(Detail | null)[]>()
      codes.forEach((c, i) => res[i] && out.set(c, res[i]!))
      missing = codes.filter((c) => !out.has(c))
    } catch (error) {
      console.warn('detail cache read failed', error)
    }
  }
  const one = async (c: string) => {
    try {
      const r = await fetch(`${BASE}/products/${encodeURIComponent(c)}`, { headers: headers(), signal: AbortSignal.timeout(7000) })
      if (!r.ok) console.warn('viator product', c, r.status)
      return r.ok ? ([c, toDetail((await r.json()) as ViatorDetail)] as const) : null
    } catch {
      return null
    }
  }
  // twenty at a time keeps a cold search inside the partner rate limits
  const fetched: (readonly [string, Detail] | null)[] = []
  for (let i = 0; i < missing.length; i += 20) fetched.push(...(await Promise.all(missing.slice(i, i + 20).map(one))))
  const got = fetched.filter((x): x is readonly [string, Detail] => !!x)
  for (const [c, d] of got) out.set(c, d)
  if (db && got.length) {
    try {
      const p = db.pipeline()
      for (const [c, d] of got) p.set(`og:viator:product:${c}`, d, { ex: 86400 })
      await p.exec()
    } catch (error) {
      console.warn('detail cache write failed', error)
    }
  }
  return out
}

function normalise(p: ViatorProduct, detail?: Detail) {
  const img = p.images?.find((i) => i.isCover) ?? p.images?.[0]
  const variant = [...(img?.variants ?? [])].filter((v) => v.width >= 400).sort((a, b) => a.width - b.width)[0]
  const d = p.duration ?? {}
  const text = `${p.title} ${p.description ?? ''}`
  const pickup = /\b(hotel pick-?up|pick-?up (and|&) drop|pick-?up from|transfers? (from|included)|door-to-door)\b/i.exec(text)
  return {
    code: p.productCode,
    title: p.title,
    summary: (p.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 420),
    url: p.productUrl ?? null,
    image: variant?.url ?? null,
    priceINR: p.pricing?.summary?.fromPrice ?? null,
    beforeINR: p.pricing?.summary?.fromPriceBeforeDiscount ?? null,
    rating: p.reviews?.combinedAverageRating ?? null,
    reviews: p.reviews?.totalReviews ?? 0,
    minutes: d.fixedDurationInMinutes ?? d.variableDurationFromMinutes ?? null,
    maxMinutes: d.variableDurationToMinutes ?? null,
    flags: p.flags ?? [],
    instant: p.confirmationType === 'INSTANT',
    pickup: pickup ? pickup[0] : null,
    detail: detail ?? null,
  }
}

export async function GET(request: Request): Promise<Response> {
  if (!process.env.VIATOR_API_KEY) return Response.json({ configured: false })
  const q = new URL(request.url).searchParams
  const raw = (q.get('dest') ?? '').toLowerCase().replace(/[^a-z .'()-]/g, '').trim().slice(0, 48)
  if (!raw) return Response.json({ error: 'missing_dest' }, { status: 400 })
  const date = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
  const start = date(q.get('start'))
  const end = date(q.get('end')) ?? start
  const budget = Number(q.get('budget')) || null
  const flags = [q.get('fc') === '1' && 'FREE_CANCELLATION', q.get('stl') === '1' && 'SKIP_THE_LINE', q.get('pt') === '1' && 'PRIVATE_TOUR'].filter(Boolean) as string[]

  let dest: Dest | null
  try {
    dest = await findDestination([ALIAS[raw] ?? raw, raw.replace(/^the /, '').replace(/ (city|state|india)$/, '')])
  } catch (error) {
    console.warn('destination index failed', error)
    return Response.json({ error: 'supplier_unavailable' }, { status: 502 })
  }
  if (!dest) return Response.json({ configured: true, destination: null, query: raw })

  const body = {
    filtering: {
      destination: String(dest.id),
      ...(flags.length ? { flags } : {}),
      ...(budget ? { lowestPrice: 0, highestPrice: budget } : {}),
      ...(start && end && start >= new Date().toISOString().slice(0, 10) ? { startDate: start, endDate: end } : {}),
    },
    sorting: { sort: 'TRAVELER_RATING', order: 'DESCENDING' },
    pagination: { start: 1, count: 40 },
    currency: 'INR',
  }
  const db = redis()
  const key = `og:viator:search:v4:${sha(JSON.stringify(body)).slice(0, 32)}`
  if (db) {
    try {
      const hit = await db.get<Record<string, unknown>>(key)
      if (hit) return Response.json({ ...hit, cached: true })
      const hour = new Date().toISOString().slice(0, 13)
      const rl = `og:rl:v:${caller(request)}:${hour}`
      const [n] = await db.pipeline().incr(rl).expire(rl, 3600).exec<[number, number]>()
      if (n > 60) return Response.json({ error: 'limit' }, { status: 429 })
    } catch (error) {
      console.warn('redis unavailable for live search', error)
    }
  }

  const t0 = Date.now()
  const r = await fetch(`${BASE}/products/search`, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(12000) })
  if (!r.ok) {
    console.warn('viator search', r.status)
    return Response.json({ error: 'supplier_error', status: r.status }, { status: 502 })
  }
  const j = (await r.json()) as { products?: ViatorProduct[]; totalCount?: number }
  // Viator's search also returns tours whose primary destination is elsewhere (a Montego Bay tour in Goa);
  // keep products whose primary destination is the searched place or inside it
  const primary = (p: ViatorProduct) => p.destinations?.find((x) => x.primary)?.ref ?? p.destinations?.[0]?.ref
  let products = j.products ?? []
  try {
    const paths = await pathsFor([...new Set(products.map(primary).filter((x): x is string => !!x))])
    products = products.filter((p) => {
      const ref = primary(p)
      const path = ref ? paths.get(ref) : undefined
      return !ref || !path || ref === String(dest.id) || path.split('.').includes(String(dest.id))
    })
  } catch (error) {
    console.warn('destination filter skipped', error)
  }
  // facts for every returned product: a listing that is silent in search can still say "meet at the start point"
  const facts = await details(products.map((p) => p.productCode))
  const result = {
    configured: true,
    supplier: 'Viator',
    destination: dest,
    filters: { flags, budget, start: body.filtering.startDate ?? null, end: body.filtering.endDate ?? null },
    total: j.totalCount ?? 0,
    checkedAt: Date.now(),
    supplierMs: Date.now() - t0,
    products: products.map((p) => normalise(p, facts.get(p.productCode))),
  }
  if (db) {
    try {
      await db.set(key, result, { ex: 600 })
    } catch (error) {
      console.warn('live cache write failed', error)
    }
  }
  return Response.json({ ...result, cached: false })
}
