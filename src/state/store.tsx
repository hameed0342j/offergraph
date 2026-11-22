import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DEMO_QUERY, type Intent } from '../engine/intent'
import { rank, type Mode, type Ranking } from '../engine/rank'
import type { Offer } from '../engine/types'
import { applyAnswers, defaultQuestions, isLive, missingFields, rulesIntent, toRankIntent, type FieldId, type TravelIntent } from '../engine/travelIntent'
import { params } from '../lib/viewport'
import { track, understand } from '../lib/understand'
import { rememberTrip } from '../lib/profile'
import { go } from '../shell/route'
import { BOOT, engine, type EngineData } from './engine'

export interface Clarify {
  intent: TravelIntent
  missing: FieldId[]
}

// the Live page opens on a real Indian market until a search replaces it
const LIVE_DEFAULT = rulesIntent('Things to do in Goa for 2 adults')

export interface SupplierEvent {
  id: number
  at: number
  supplier: string
  entityId: string
  entityName: string
  cluster: string
  variantName: string
  offerId: string
  kind: 'price-up' | 'price-down' | 'sold-out' | 'back'
  delta: number
  text: string
}

export interface Recheck {
  status: 'checking' | 'verified' | 'changed' | 'unavailable'
  price: number
  before: number
  at: number
  ms: number
}

interface Store {
  data: EngineData
  query: string
  setQuery: (q: string) => void
  travel: TravelIntent
  liveTravel: TravelIntent
  openTrip: (t: TravelIntent) => void
  search: (text: string) => Promise<void>
  searching: boolean
  clarify: Clarify | null
  answerClarify: (answers: Partial<Record<FieldId, string | string[]>>) => void
  closeClarify: () => void
  intent: Intent
  mode: Mode
  setMode: (m: Mode) => void
  ranking: Ranking
  cluster: string
  selectCluster: (id: string) => void
  focus: string | null // variant id
  setFocus: (id: string | null) => void
  events: SupplierEvent[]
  simulateChange: () => void
  rechecks: Record<string, Recheck>
  recheck: (offer: Offer) => void
  now: number
  frozen: boolean
  hotel: string
  setHotel: (id: string) => void
}

const Ctx = createContext<Store | null>(null)

// Scripted supplier changes for the demo: each finds an offer and changes it.
const SCRIPT: { entity: string; supplier?: string; variant: RegExp; kind: SupplierEvent['kind']; pct: number }[] = [
  { entity: 'flyer', supplier: 'meridian', variant: /shared transfer/i, kind: 'price-up', pct: 0.18 },
  { entity: 'night-safari', variant: /tram \+ shared transfer/i, kind: 'price-down', pct: 0.12 },
  { entity: 'river-cruise', variant: /shared transfer/i, kind: 'sold-out', pct: 0 },
  { entity: 'cable-car', variant: /shared transfer/i, kind: 'price-down', pct: 0.06 },
  { entity: 'river-cruise', variant: /shared transfer/i, kind: 'back', pct: 0 },
]

const fmtINR = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')

export function StoreProvider({ children }: { children: ReactNode }) {
  const data = engine()
  const frozen = params.has('t')
  // the demo opens on a complete request; a search replaces it
  const [travel, setTravel] = useState<TravelIntent>(() => applyAnswers(rulesIntent(params.get('q') ?? DEMO_QUERY), { party: 'Family, 2 adults 2 kids' }))
  const [liveTravel, setLiveTravel] = useState<TravelIntent>(LIVE_DEFAULT)
  const [searching, setSearching] = useState(false)
  const [clarify, setClarify] = useState<Clarify | null>(null)
  const query = travel.text
  const setQuery = useCallback((q: string) => setTravel(applyAnswers(rulesIntent(q), {})), [])
  const [mode, setMode] = useState<Mode>((params.get('mode') as Mode) || 'match')
  const [version, setVersion] = useState(0)
  const [events, setEvents] = useState<SupplierEvent[]>([])
  const [rechecks, setRechecks] = useState<Record<string, Recheck>>({})
  const [focus, setFocus] = useState<string | null>(null)
  const [clusterSel, setClusterSel] = useState<string | null>(params.get('cluster'))
  const [now, setNow] = useState(BOOT)
  const [hotel, setHotel] = useState<string>(() => data.hotels.properties.find((p) => /pan pacific orchard/i.test(p.name))?.id ?? data.hotels.properties[0].id)
  const step = useRef(0)

  const intent = useMemo(() => toRankIntent(travel), [travel])

  // a complete request: Singapore opens the multi-supplier demo graph, anywhere else the live supplier page
  const commit = useCallback((t: TravelIntent) => {
    setClarify(null)
    rememberTrip(t)
    track(t)
    if (isLive(t)) {
      setTravel(t)
      setFocus(null)
      setClusterSel(null)
      go(t.category === 'hotel' ? 'hotels' : 'offers')
    } else {
      setLiveTravel(t)
      go('live')
    }
  }, [])

  // ask for whatever is still missing, else show results
  const openTrip = useCallback(
    (t: TravelIntent) => {
      const missing = missingFields(t)
      if (missing.length) setClarify({ intent: { ...t, questions: t.questions.length ? t.questions : defaultQuestions(t) }, missing })
      else commit(t)
    },
    [commit],
  )

  const search = useCallback(
    async (text: string) => {
      if (!text.trim()) return
      setSearching(true)
      const t = await understand(text.trim())
      setSearching(false)
      openTrip(t)
    },
    [openTrip],
  )

  const answerClarify = useCallback(
    (answers: Partial<Record<FieldId, string | string[]>>) => {
      if (!clarify) return
      openTrip({ ...applyAnswers(clarify.intent, answers), questions: [] })
    },
    [clarify, openTrip],
  )
  const ranking = useMemo(() => rank(data.res.entities, intent, mode, now), [data, intent, mode, now, version]) // eslint-disable-line react-hooks/exhaustive-deps
  const cluster = clusterSel ?? ranking.topPerEntity[0]?.entity.cluster ?? 'marina'

  // live clock for freshness labels (frozen stills keep the boot time)
  useEffect(() => {
    if (frozen) return
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [frozen])

  const simulateChange = useCallback(() => {
    const s = SCRIPT[step.current % SCRIPT.length]
    step.current++
    const e = data.res.entities.find((x) => x.id === s.entity)
    const v = e?.variants.find((x) => s.variant.test(x.name))
    if (!e || !v || !v.offers.length) return
    const o = (s.supplier && v.offers.find((x) => x.supplier === s.supplier)) || [...v.offers].sort((a, b) => a.priceINR - b.priceINR)[0]
    const t = Date.now()
    let delta = 0
    let text = ''
    if (s.kind === 'price-up' || s.kind === 'price-down') {
      const before = o.priceINR
      o.priceINR = Math.round((before * (1 + (s.kind === 'price-up' ? s.pct : -s.pct))) / 10) * 10
      o.parsed.priceINR = o.priceINR
      delta = o.priceINR - before
      text = `${delta > 0 ? '+' : '−'}${fmtINR(Math.abs(delta))}`
    } else if (s.kind === 'sold-out') {
      for (const x of v.offers) x.availability = 'sold-out'
      text = 'Sold out'
    } else {
      for (const x of v.offers) x.availability = 'instant'
      text = 'Back on sale'
    }
    o.checkedAt = t
    o.parsed.record.checkedAt = t
    setEvents((ev) => [{ id: t, at: t, supplier: o.supplier, entityId: e.id, entityName: e.name, cluster: e.cluster, variantName: v.name, offerId: o.id, kind: s.kind, delta, text }, ...ev].slice(0, 12))
    setNow(t)
    setVersion((x) => x + 1)
  }, [data])

  // auto-play supplier changes after the intro, unless the page is frozen for stills
  useEffect(() => {
    if (frozen || params.has('nolive')) return
    const first = setTimeout(simulateChange, 9000)
    const iv = setInterval(() => document.visibilityState === 'visible' && simulateChange(), 18000)
    return () => {
      clearTimeout(first)
      clearInterval(iv)
    }
  }, [frozen, simulateChange])

  const recheck = useCallback((o: Offer) => {
    const before = o.priceINR
    setRechecks((r) => ({ ...r, [o.id]: { status: 'checking', price: before, before, at: Date.now(), ms: 0 } }))
    const latency = 620 + ((o.id.charCodeAt(2) * 37) % 380)
    setTimeout(() => {
      // simulated supplier endpoint: retail aggregators drift, contracted suppliers hold their rate
      const drift = o.supplier === 'corvid' || o.supplier === 'nomad' ? 0.04 : 0
      const price = Math.round((before * (1 + drift)) / 10) * 10
      const status: Recheck['status'] = o.availability === 'sold-out' ? 'unavailable' : price !== before ? 'changed' : 'verified'
      if (price !== before) {
        o.priceINR = price
        o.parsed.priceINR = price
      }
      o.checkedAt = Date.now()
      setRechecks((r) => ({ ...r, [o.id]: { status, price, before, at: Date.now(), ms: latency } }))
      setNow(Date.now())
      setVersion((x) => x + 1)
    }, latency)
  }, [])

  const value: Store = {
    data,
    query,
    setQuery,
    travel,
    liveTravel,
    openTrip,
    search,
    searching,
    clarify,
    answerClarify,
    closeClarify: () => setClarify(null),
    intent,
    mode,
    setMode,
    ranking,
    cluster,
    selectCluster: setClusterSel,
    focus,
    setFocus,
    events,
    simulateChange,
    rechecks,
    recheck,
    now,
    frozen,
    hotel,
    setHotel,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}

export { fmtINR }
