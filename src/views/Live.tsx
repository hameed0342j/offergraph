import { useEffect, useMemo, useState } from 'react'
import { shareOffer } from './Chat'
import { ArrowRight, ArrowUpRight, Check, CircleHelp, Clock, MapPin, Pencil, Radio, Star, X } from 'lucide-react'
import { fmtDuration, rankLive, type LiveRanked } from '../engine/liveRank'
import { personalChips } from '../engine/travelIntent'
import { fetchLive, type LiveResult } from '../lib/live'
import { useStore } from '../state/store'
import { d } from '../ui/kit'
import './live.css'

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')
const clock = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
const INDIA_PICKS = ['Goa', 'Jaipur', 'Kerala', 'Agra', 'Udaipur', 'Varanasi']
const edit = () => window.dispatchEvent(new Event('og:edit-request'))

function Card({ x, i, party }: { x: LiveRanked; i: number; party: number }) {
  const p = x.p
  const dur = fmtDuration(p.minutes, p.maxMinutes)
  const checked = new Set(x.checks.map((c) => c.label))
  const f = p.detail
  const extra = [
    p.flags.includes('FREE_CANCELLATION') && !checked.has('Free cancellation') && 'Free cancellation',
    p.flags.includes('PRIVATE_TOUR') && !checked.has('Private') && 'Private',
    p.flags.includes('SKIP_THE_LINE') && !checked.has('Skip the line') && 'Skip the line',
    f?.pickupType === 'everyone' && !checked.has('Hotel pickup') && 'Pickup included',
    f?.fitness === 'easy' && !x.prefs.includes('Easy fitness level') && 'Easy fitness level',
    f?.stroller && !checked.has('Family') && 'Stroller friendly',
    f?.wheelchair && 'Wheelchair accessible',
  ].filter(Boolean) as string[]
  return (
    <li className="lcard a-blur" style={d(Math.min(i, 8) * 45, { ['--b' as string]: '0.5rem' })}>
      <a className="lcard-img" href={p.url ?? undefined} target="_blank" rel="noopener noreferrer sponsored" tabIndex={-1} aria-hidden>
        {p.image && <img src={p.image} alt="" loading="lazy" decoding="async" />}
        <span className="lcard-rank">{i + 1}</span>
        {x.multiDay && <span className="lcard-tag">Multi-day</span>}
      </a>
      <div className="lcard-body">
        <h3>
          <a href={p.url ?? undefined} target="_blank" rel="noopener noreferrer sponsored">
            {p.title}
          </a>
        </h3>
        <div className="lcard-meta">
          {p.rating !== null && (
            <span>
              <Star className="star" />
              {p.rating.toFixed(1)} <em>({p.reviews.toLocaleString('en-IN')})</em>
            </span>
          )}
          {dur && (
            <span>
              <Clock />
              {dur}
            </span>
          )}
          <span>{p.instant ? 'Instant confirmation' : 'On request'}</span>
          {f?.operator && <span className="lcard-op">by {f.operator}</span>}
        </div>
        {(x.checks.length > 0 || x.prefs.length > 0 || extra.length > 0) && (
          <div className="lcard-checks">
            {x.checks.map((c) => (
              <span key={c.label} className={`lchk ${c.state}`} title={c.why}>
                {c.state === 'pass' ? <Check /> : c.state === 'fail' ? <X /> : <CircleHelp />}
                {c.label}
              </span>
            ))}
            {x.prefs.map((l) => (
              <span key={l} className="lchk pref" title="Matches a preference from the request">
                {l}
              </span>
            ))}
            {extra.map((l) => (
              <span key={l} className="lchk flag">
                {l}
              </span>
            ))}
          </div>
        )}
        <div className="lcard-foot">
          {p.priceINR !== null ? (
            <div className="lcard-price">
              <b>{inr(p.priceINR)}</b>
              <span>per person{p.beforeINR && p.beforeINR > p.priceINR ? <s>{inr(p.beforeINR)}</s> : null}</span>
              {party > 1 && <em>about {inr(p.priceINR * party)} for {party}</em>}
            </div>
          ) : (
            <div className="lcard-price">
              <span>Price on request</span>
            </div>
          )}
          <button className="lcard-ask" onClick={() => shareOffer({ title: p.title, priceINR: p.priceINR, url: p.url, image: p.image })}>
            Ask agent
          </button>
          {p.url && (
            <a className="lcard-go" href={p.url} target="_blank" rel="noopener noreferrer sponsored">
              View on Viator
              <ArrowUpRight />
            </a>
          )}
        </div>
      </div>
    </li>
  )
}

export function LiveView() {
  const { liveTravel, openTrip } = useStore()
  const t = liveTravel
  const [res, setRes] = useState<LiveResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let on = true
    setLoading(true)
    fetchLive(t).then((r) => {
      if (!on) return
      setRes(r)
      setLoading(false)
    })
    return () => {
      on = false
    }
  }, [t])

  const out = useMemo(() => (res?.products ? rankLive(res.products, t) : null), [res, t])
  const party = (t.party.adults ?? 2) + (t.party.children ?? 0)
  const chips = personalChips(t)
  const dest = res?.destination
  const hero = out?.ranked[0]?.p.image ?? null
  const pick = (name: string) => openTrip({ ...t, destination: name, category: t.category ?? 'sightseeing', text: `Things to do in ${name}` })

  return (
    <div className="live">
      {hero && <div className="live-hero" style={{ backgroundImage: `url("${hero}")` }} aria-hidden />}
      <aside className="live-side panel a-blur" style={d(150)}>
        <div className="live-kicker">
          <Radio />
          Live supplier data
        </div>
        <h1 className="live-title">{dest?.name ?? t.destination ?? 'Live'}</h1>
        <div className="live-sub">
          <MapPin />
          {dest ? `${dest.country ?? ''}${dest.country && dest.type !== 'COUNTRY' ? ' · ' : ''}${dest.type !== 'COUNTRY' ? dest.type.toLowerCase() : ''}` : 'Things to do'}
        </div>

        {out && res?.total !== undefined && (
          <div className="live-stats">
            <div>
              <b>{out.ranked.length}</b>
              <span>fit your request</span>
            </div>
            <div>
              <b>{res.total.toLocaleString('en-IN')}</b>
              <span>live listings on Viator</span>
            </div>
          </div>
        )}
        {res?.checkedAt && (
          <div className="live-fresh">
            <i className="live-dot" />
            Checked {clock(res.checkedAt)} · {res.cached ? 'cached, refreshes every 10 min' : `Viator answered in ${res.supplierMs} ms`}
          </div>
        )}

        <div className="live-block">
          <div className="live-label">Personalised for</div>
          <div className="live-chips">
            {chips.length ? chips.map((c) => <span key={c} className="chip">{c}</span>) : <span className="live-muted">Add travellers and dates to personalise</span>}
          </div>
        </div>

        {res?.filters && (res.filters.flags.length > 0 || res.filters.budget || res.filters.start) && (
          <div className="live-block">
            <div className="live-label">Filtered at the supplier</div>
            <ul className="live-filters">
              {res.filters.flags.map((f) => (
                <li key={f}>{f === 'FREE_CANCELLATION' ? 'Free cancellation' : f === 'SKIP_THE_LINE' ? 'Skip the line' : 'Private tour'}</li>
              ))}
              {res.filters.budget && <li>Up to {inr(res.filters.budget)} per person</li>}
              {res.filters.start && <li>Available {res.filters.start === res.filters.end || !res.filters.end ? day(res.filters.start) : `${day(res.filters.start)} to ${day(res.filters.end)}`}</li>}
            </ul>
          </div>
        )}

        <button className="req-go live-edit" onClick={edit}>
          <Pencil />
          Edit request
        </button>
        <p className="live-note">
          Prices are Viator's live "from" prices in rupees. <Check className="ok" /> is stated by the supplier, <CircleHelp /> is not stated, so it is never counted as a pass.
        </p>
      </aside>

      <main className="live-main">
        {t.category === 'hotel' && (
          <div className="live-banner a-blur" style={d(200)}>
            Live hotels need the Hotelbeds hotel key and secret. Showing live things to do in {t.destination} meanwhile.
          </div>
        )}

        {loading ? (
          <ol className="live-grid" aria-busy="true" aria-label="Loading live results">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="lcard skeleton" />
            ))}
          </ol>
        ) : res && !res.configured ? (
          <div className="live-empty panel">
            <h2>Live supplier not connected</h2>
            <p>Set VIATOR_API_KEY in the deployment to search live inventory.</p>
          </div>
        ) : !dest ? (
          <div className="live-empty panel a-blur" style={d(100)}>
            <h2>{res?.error ? 'The live supplier did not answer' : `No live supplier covers ${t.destination ?? 'that'} yet`}</h2>
            <p>{res?.error ? 'Try again in a moment, or pick another destination.' : 'Viator covers 81 Indian cities. Try one of these:'}</p>
            <div className="live-picks">
              {INDIA_PICKS.map((n) => (
                <button key={n} className="pill-btn" onClick={() => pick(n)}>
                  {n}
                </button>
              ))}
              <button className="req-go" onClick={() => openTrip({ ...t, destination: 'Singapore' })}>
                Singapore demo
                <ArrowRight />
              </button>
            </div>
          </div>
        ) : out && out.ranked.length === 0 ? (
          <div className="live-empty panel">
            <h2>Nothing passes every must-have</h2>
            <p>{out.excluded.length} live listings were checked; each one fails at least one requirement. Loosen a must-have to see them.</p>
            <button className="req-go" onClick={edit}>
              Edit request
              <ArrowRight />
            </button>
          </div>
        ) : (
          out && (
            <>
              <ol className="live-grid">
                {out.ranked.slice(0, 18).map((x, i) => (
                  <Card key={x.p.code} x={x} i={i} party={party} />
                ))}
              </ol>
              {out.excluded.length > 0 && (
                <section className="live-excluded">
                  <h2>Excluded by a must-have ({out.excluded.length})</h2>
                  <ul>
                    {out.excluded.slice(0, 8).map((x) => (
                      <li key={x.p.code}>
                        <span className="lx-title">{x.p.title}</span>
                        <span className="lx-why">{x.checks.filter((c) => c.state === 'fail').map((c) => c.why).join(', ')}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )
        )}
      </main>
    </div>
  )
}
