import { useMemo, type ReactNode } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  CircleAlert,
  CircleCheck,
  Gauge,
  GitBranch,
  Globe,
  Layers,
  Loader2,
  MapPin,
  MessageSquareText,
  Pencil,
  RefreshCw,
  Sparkles,
  Tag,
  Trophy,
  Users,
  Combine,
  X,
} from 'lucide-react'
import { CLUSTERS } from '../data/sg/catalog'
import { SUPPLIER_BY_ID } from '../data/suppliers'
import { clock, freshness, SUPPLIER_LABEL, type Result } from '../engine/rank'
import type { Intent } from '../engine/intent'
import { useStore, fmtINR } from '../state/store'
import { BarRow, Bars, d, Histogram, Legend3, Panel, PanelHead, SupplierMark, Thumb, Tile } from '../ui/kit'
import { go } from '../shell/route'
import { personalChips } from '../engine/travelIntent'
import './offers.css'

export function OffersView() {
  const { ranking, data, intent, cluster, now, focus, travel } = useStore()
  const kids = (travel.party.children ?? 0) > 0
  const title = kids ? 'Family day out' : travel.party.adults === 2 ? 'Day out for two' : travel.party.adults === 1 ? 'Solo day out' : 'Day out'
  const latest = Math.max(...ranking.results.flatMap((r) => (r.best ? [r.best.offer.checkedAt] : [])))
  const c = CLUSTERS.find((x) => x.id === cluster)!
  const focused = focus ? ranking.results.find((r) => r.variant.id === focus) ?? null : null

  return (
    <div className="offers">
      <header className="hdr">
        <div className="hdr-top a-blur" style={d(180)}>
          <span className="chip-live">Live offers</span>
          <span className="hdr-status">
            <i className="dot lime-dot" />
            Prices checked {clock(latest)}
          </span>
        </div>
        <h1 className="hdr-title a-blur" style={d(230, { ['--b' as string]: '0.8rem', ['--dur' as string]: '760ms' })}>
          {title}
        </h1>
        <div className="hdr-meta a-blur" style={d(330)}>
          <span>
            <Users />
            {intent.party ? `${intent.party.adults} adults, ${intent.party.children} children` : 'Party not set'}
          </span>
          <span>
            <Globe />
            Singapore, {data.res.entities.length} attractions
          </span>
        </div>

      </header>

      <aside className="col col-left">
        <RequestPanel />
        <MatchingPanel />
      </aside>

      <aside className="col col-right">
        <ClusterPanel clusterId={c.id} />
        <RankedPanel now={now} />
      </aside>

      {focused && <OfferDetail r={focused} key={focused.variant.id} />}
    </div>
  )
}

/** request text with the words that produced each constraint marked */
function Highlighted({ intent }: { intent: Intent }) {
  const text = intent.text
  const marks: { s: number; e: number; kind: 'hard' | 'soft' }[] = []
  const low = text.toLowerCase()
  for (const [list, kind] of [
    [intent.hard, 'hard'],
    [intent.soft, 'soft'],
  ] as const) {
    for (const c of list) {
      const i = low.indexOf(c.evidence.trim().toLowerCase())
      if (i >= 0 && !marks.some((m) => i < m.e && i + c.evidence.trim().length > m.s)) marks.push({ s: i, e: i + c.evidence.trim().length, kind })
    }
  }
  marks.sort((a, b) => a.s - b.s)
  const out: ReactNode[] = []
  let p = 0
  marks.forEach((m, i) => {
    if (m.s > p) out.push(text.slice(p, m.s))
    out.push(
      <mark key={i} className={m.kind}>
        {text.slice(m.s, m.e)}
      </mark>,
    )
    p = m.e
  })
  out.push(text.slice(p))
  return <>{out}</>
}

function RequestPanel() {
  const { intent, ranking, travel } = useStore()
  const base = ranking.funnel[0]?.value || 1
  const chips = personalChips(travel)
  return (
    <Panel delay={1250} className="p-request">
      <PanelHead
        delay={1300}
        icon={<MessageSquareText />}
        title="Request"
        action={
          <button className="icon-btn" aria-label="Change the request" title="Change the request" onClick={() => window.dispatchEvent(new Event('og:edit-request'))}>
            <Pencil />
          </button>
        }
      />
      <p className="req-text a-blur" style={d(1350)}>
        <Highlighted intent={intent} />
      </p>
      {chips.length > 0 && (
        <div className="personal a-blur" style={d(1380)} aria-label="Personalised for">
          {chips.slice(0, 4).map((c) => (
            <span key={c} className="chip">
              {c}
            </span>
          ))}
        </div>
      )}
      <div className="rows">
        {ranking.funnel.map((f, i) => (
          <BarRow
            key={f.label}
            delay={1400 + i * 70}
            label={f.label}
            kind={f.kind === 'base' ? undefined : f.kind === 'soft' ? 'preference' : 'must'}
            value={f.value}
            frac={f.value / base}
            tone={f.kind === 'result' ? 'lime' : f.kind === 'soft' ? 'dim' : 'grey'}
          />
        ))}
      </div>
    </Panel>
  )
}

function MatchingPanel() {
  const { data } = useStore()
  const h = data.histogram
  const variants = data.res.entities.reduce((s, e) => s + e.variants.length, 0)
  const cut = Math.round((1 - variants / data.records.length) * 100)
  return (
    <Panel delay={1450} className="p-match">
      <PanelHead delay={1650} icon={<Combine />} title="Supplier matching" onAction={() => go('compare')} actionLabel="Open comparison" />
      <div className="big-row">
        <div className="big a-blur" style={d(1700)}>
          <span className="big-num">{data.res.entities.length}</span>
          <span className="big-unit">attractions</span>
        </div>
        <span className="chip-delta a-blur" style={d(1760)} title={`${data.records.length} supplier records became ${variants} distinct variants`}>
          −{cut}% listings
        </span>
      </div>
      <div className="sub a-blur" style={d(1760)}>
        {data.res.candidatePairs.toLocaleString('en-IN')} pairs from {data.records.length} records, {Math.round(data.res.ms + data.parseMs)} ms
      </div>
      <Histogram bins={h.bins} tone={h.decision} delay={1850} />
      <div className="hist-axis a-fade" style={d(2050)}>
        <span>1.0</span>
        <span>match score</span>
        <span>0</span>
      </div>
      <Legend3
        delay={2100}
        items={[
          { label: 'Auto-linked', value: `${h.shares[0]}%`, color: 'var(--lime)' },
          { label: 'Arbiter', value: `${h.shares[1]}%`, color: '#c9cbc7' },
          { label: 'Kept apart', value: `${h.shares[2]}%`, color: 'rgba(255,255,255,0.25)' },
        ]}
      />
    </Panel>
  )
}

function ClusterPanel({ clusterId }: { clusterId: string }) {
  const { data, ranking, setFocus } = useStore()
  const c = CLUSTERS.find((x) => x.id === clusterId)!
  const ents = data.res.entities.filter((e) => e.cluster === clusterId)
  const results = ranking.results.filter((r) => r.entity.cluster === clusterId)
  const fits = results.reduce((s, r) => s + (r.status === 'eligible' ? r.offers.filter((o) => o.eligible).length : 0), 0)
  const top = results.find((r) => r.status !== 'excluded') ?? results[0]
  // offers here that fit the request (then ones that need checks), cheapest first
  const fitting = results.flatMap((r) => r.offers.filter((o) => o.eligible && r.status === 'eligible').map((o) => ({ r, o })))
  const pool = fitting.length >= 4 ? fitting : [...fitting, ...results.filter((r) => r.status === 'partial').flatMap((r) => r.offers.map((o) => ({ r, o })))]
  const offers = pool.sort((a, b) => a.o.offer.priceINR - b.o.offer.priceINR).slice(0, 12)
  const rec = top?.best
  const on = offers.findIndex((x) => x.o === rec)
  return (
    <Panel delay={1800} className="p-cluster">
      <PanelHead delay={1850} icon={<MapPin />} title={`${c.name} cluster`} onAction={() => top && setFocus(top.variant.id)} actionLabel="Open best offer" />
      <div className="chips a-blur" style={d(1950)}>
        <span className="chip">
          <MapPin className="lime" />
          {c.area}
        </span>
        <span className="chip">{c.transferMin} min from hotel</span>
      </div>
      <div className="tiles">
        <Tile delay={2150} icon={<Layers />} label="Supplier records" value={ents.reduce((s, e) => s + e.records, 0)} />
        <Tile delay={2200} icon={<GitBranch />} label="Variants" value={ents.reduce((s, e) => s + e.variants.length, 0)} />
        <Tile delay={2300} icon={<Tag />} label="Fit the request" value={fits} />
        <Tile delay={2350} icon={<Gauge />} label="Best fit" value={top ? Math.round(top.score) : '–'} />
      </div>
      <div className="bars-head a-blur" style={d(2300)}>
        <span>Fitting offers here, by price</span>
        <b>{rec ? fmtINR(rec.offer.priceINR) : '–'}</b>
      </div>
      <Bars
        delay={2500}
        values={offers.map((x) => x.o.offer.priceINR)}
        on={on}
        warn={offers.map((x, i) => (x.r.status !== 'eligible' || !x.o.eligible ? i : -1)).filter((i) => i >= 0 && i !== on)}
        title={(i) => `${SUPPLIER_LABEL(offers[i].o.offer.supplier)}, ${offers[i].r.entity.name}: ${fmtINR(offers[i].o.offer.priceINR)}${offers[i].o.eligible ? '' : ' (does not fit)'}`}
      />
    </Panel>
  )
}

function RankedPanel({ now }: { now: number }) {
  const { ranking, setFocus, focus, selectCluster, simulateChange, events } = useStore()
  // taller screens show more rows instead of spreading five apart
  const top = ranking.topPerEntity.slice(0, typeof window !== 'undefined' && window.innerHeight / (parseFloat(getComputedStyle(document.documentElement).fontSize) || 10) > 72 ? 7 : 5)
  const ev = events[0] && now - events[0].at < 8000 ? events[0] : null
  return (
    <Panel delay={1900} className="p-ranked">
      <PanelHead
        delay={1950}
        icon={<Trophy />}
        title="Ranked offers"
        action={
          <button className="icon-btn" aria-label="Simulate a supplier change" title="Simulate a supplier change" onClick={simulateChange}>
            <RefreshCw />
          </button>
        }
      />
      <div className="tbl-head a-blur" style={d(2000)}>
        <span>Offer</span>
        <span>Checked</span>
        <span>Fit</span>
      </div>
      <div className="tbl-body">
        {top.map((r, i) => {
          const o = r.best!.offer
          const fresh = freshness(now, o.checkedAt) > 0.85
          return (
            <div
              key={r.variant.id}
              className={`tbl-row a-blur ${focus === r.variant.id ? 'sel' : ''} ${ev && ev.entityId === r.entity.id ? 'changed ' + ev.kind : ''}`}
              style={d(2050 + i * 75, { ['--b' as string]: '0.9rem' })}
              onClick={() => {
                selectCluster(r.entity.cluster)
                setFocus(focus === r.variant.id ? null : r.variant.id)
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setFocus(r.variant.id)}
            >
              <span className="tbl-who">
                <Thumb photo={r.entity.photo} category={r.entity.category} />
                <span style={{ minWidth: 0 }}>
                  <div className="tbl-name">{r.entity.name}</div>
                  <div className="tbl-sub">
                    {r.variant.name}, {SUPPLIER_LABEL(o.supplier)}
                  </div>
                </span>
              </span>
              <span className={`tbl-mid ${fresh ? 'lime' : ''}`}>{clock(o.checkedAt)}</span>
              <span className="tbl-score">{Math.round(r.score)}</span>
            </div>
          )
        })}
      </div>
      <button className="btn-wide a-blur" style={d(2450)} onClick={() => go('compare')}>
        Compare all {ranking.counts.eligibleVariants} fitting offers
        <ArrowRight />
      </button>
    </Panel>
  )
}

function OfferDetail({ r }: { r: Result }) {
  const { setFocus, recheck, rechecks, now } = useStore()
  const best = r.best!
  const rc = rechecks[best.offer.id]
  const facts = r.reasons
  const sorted = useMemo(() => [...r.offers].sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.offer.priceINR - b.offer.priceINR), [r])
  return (
    <section className="detail panel a-blur" style={d(0, { ['--dur' as string]: '420ms', ['--b' as string]: '0.8rem' })} aria-label="Offer detail">
      <div className="ph">
        <Thumb photo={r.entity.photo} category={r.entity.category} size="3.4rem" />
        <div style={{ minWidth: 0 }}>
          <div className="dt-title">{r.entity.name}</div>
          <div className="dt-sub">{r.variant.name}</div>
        </div>
        <span className="ph-spacer" />
        <span className={`fit-pill ${r.status}`}>Fit {Math.round(r.score)}</span>
        <button className="icon-btn" aria-label="Close" onClick={() => setFocus(null)}>
          <X />
        </button>
      </div>

      <div className="dt-grid">
        <div>
          <div className="dt-label">Why it ranks here</div>
          <ul className="reasons">
            {facts.map((f, i) => (
              <li key={i} className={f.kind}>
                {f.kind === 'fact' ? <CircleCheck /> : f.kind === 'inference' ? <Sparkles /> : <CircleAlert />}
                <span>
                  {f.text}
                  {f.source && <em>{f.source}</em>}
                </span>
              </li>
            ))}
          </ul>
          <div className="dt-key">
            <span>
              <CircleCheck /> supplier fact
            </span>
            <span>
              <Sparkles /> inferred
            </span>
            <span>
              <CircleAlert /> not verified
            </span>
          </div>
        </div>
        <div>
          <div className="dt-label">Same variant from {r.offers.length} suppliers</div>
          <div className="sup-list">
            {sorted.map((s) => {
              const sup = SUPPLIER_BY_ID[s.offer.supplier]
              return (
                <div key={s.offer.id} className={`sup-row ${s === best ? 'best' : ''} ${s.eligible ? '' : 'out'}`}>
                  <SupplierMark kind={sup.mark} tile={sup.tile} ink={sup.ink} size="2.2rem" />
                  <span className="sup-name">
                    {sup.name}
                    <small>
                      {s.offer.cancelH === null ? 'Cancellation not stated' : s.offer.cancelH === 0 ? 'Non-refundable' : `Free cancel ${s.offer.cancelH}h`}, {sup.payment}
                    </small>
                  </span>
                  <span className="sup-avail">{s.offer.availability === 'instant' ? 'Instant' : s.offer.availability === 'on-request' ? 'On request' : 'Sold out'}</span>
                  <span className="sup-price">{fmtINR(s.offer.priceINR)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="dt-foot">
        <div className="dt-status">
          {!rc && (
            <>
              <BadgeCheck />
              Last supplier response {clock(best.offer.checkedAt)}, {Math.round((now - best.offer.checkedAt) / 60000)} min ago
            </>
          )}
          {rc?.status === 'checking' && (
            <>
              <Loader2 className="spin" />
              Asking {SUPPLIER_LABEL(best.offer.supplier)} for the live price and availability…
            </>
          )}
          {rc && rc.status !== 'checking' && (
            <span className={`rc ${rc.status}`}>
              {rc.status === 'verified' && <>Verified at {clock(rc.at)}: {fmtINR(rc.price)}, available, terms unchanged ({rc.ms} ms)</>}
              {rc.status === 'changed' && <>Price changed at {clock(rc.at)}: {fmtINR(rc.before)} → {fmtINR(rc.price)}. Ranking updated.</>}
              {rc.status === 'unavailable' && <>No longer available at {clock(rc.at)}. Showing the next best offer.</>}
            </span>
          )}
        </div>
        <button className="req-go" disabled={rc?.status === 'checking'} onClick={() => recheck(best.offer)}>
          <RefreshCw />
          Recheck before booking
        </button>
      </div>
    </section>
  )
}
