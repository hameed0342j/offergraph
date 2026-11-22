import { useMemo, useState } from 'react'
import { ArrowRight, CalendarRange, Combine, Globe, Layers, MapPin, Route, Store, Building2, Percent, GitBranch } from 'lucide-react'
import { DESTINATIONS, HUB, type Destination } from '../data/network'
import { desktopCamera, mobileCamera, MAP, project } from '../map/projection'
import { useStore } from '../state/store'
import type { Viewport } from '../lib/viewport'
import { BarRow, d, Histogram, Legend3, Panel, PanelHead, Tile } from '../ui/kit'
import { go } from '../shell/route'
import '../map/map.css'
import './network.css'

const STATUS_LABEL = { live: 'Live in this demo', shadow: 'Shadow mode next', planned: 'Planned' } as const

/** Regional view: Indian agents' outbound markets on NASA Blue Marble, with the rollout plan. */
export function NetworkView({ vp }: { vp: Viewport }) {
  const { data } = useStore()
  const [sel, setSel] = useState('singapore')
  const cam = useMemo(() => (vp.mobile ? mobileCamera(vp.w, Math.round(vp.h * 0.58), HUB) : desktopCamera(vp.w, vp.h, vp.unit, HUB)), [vp])
  const u = vp.mobile ? vp.w / 470 : vp.unit
  const mapH = vp.mobile ? Math.round(vp.h * 0.58) : vp.h
  const [hx, hy] = project(cam, HUB.lon, HUB.lat)
  const live = data.res.entities.reduce((s, e) => s + e.variants.length, 0)
  const dests = DESTINATIONS.map((x) => {
    const [px, py] = project(cam, x.lon, x.lat)
    const isLive = x.id === 'singapore'
    return { ...x, px, py, r: Math.max(12, Math.min(28, 10 + Math.sqrt(x.raw / 20000) * 18)) * u, count: isLive ? data.records.length : x.raw }
  })
  const s = dests.find((x) => x.id === sel)!
  const variants = data.res.entities.reduce((a, e) => a + e.variants.length, 0)
  const h = data.histogram

  return (
    <>
      <div className={`city region ${vp.mobile ? 'mobile' : ''}`} style={{ height: mapH }}>
        <div className="city-world" style={{ transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.k})`, width: MAP.width, height: MAP.height }}>
          <img className="city-img" src="/map/basemap.jpg" width={MAP.width} height={MAP.height} alt="" draggable={false} />
        </div>
        <div className="city-light" />
        <div className="city-vignette" />
        <svg className="city-svg" width={vp.w} height={mapH} aria-hidden>
          {dests.map((x, i) => {
            const dx = x.px - hx
            const dy = x.py - hy
            const len = Math.hypot(dx, dy)
            const ux = dx / len
            const uy = dy / len
            const bend = (i % 2 ? 1 : -1) * len * 0.1
            const sx = hx + ux * 19 * u
            const sy = hy + uy * 19 * u
            const ex = x.px - ux * (x.r + 3 * u)
            const ey = x.py - uy * (x.r + 3 * u)
            return (
              <path key={x.id} className={`link ${x.rollout === 'planned' ? 'faint' : ''} a-fade`} style={d(2800 + i * 70)} d={`M${sx},${sy} Q${(sx + ex) / 2 - uy * bend},${(sy + ey) / 2 + ux * bend} ${ex},${ey}`} strokeWidth={Math.max(1, u)} strokeDasharray={`${3 * u} ${3 * u}`} />
            )
          })}
          {dests.map((x, i) => (
            <g key={x.id} className={`cl ${x.rollout === 'live' ? 'eligible' : x.rollout === 'shadow' ? 'partial' : 'excluded'} hit ${x.id === sel ? 'sel' : ''}`} onClick={() => setSel(x.id)}>
              <g className="a-scale" style={d(2700 + i * 75)}>
                {x.id === sel && <circle cx={x.px} cy={x.py} r={x.r + 7 * u} className="ring-out" strokeWidth={Math.max(1, u)} strokeDasharray={`${2 * u} ${2.6 * u}`} />}
                <circle cx={x.px} cy={x.py} r={x.r} className="disc" strokeWidth={x.rollout === 'planned' ? Math.max(1, u) : Math.max(1.2, 1.6 * u)} strokeDasharray={x.rollout === 'planned' ? `${2 * u} ${2.4 * u}` : undefined} />
                <circle cx={x.px} cy={x.py} r={2.4 * u} className="core" />
              </g>
            </g>
          ))}
          <g className="a-resolve" style={d(2500)}>
            <circle cx={hx} cy={hy} r={18.5 * u} className="hub-out" />
            <circle cx={hx} cy={hy} r={13 * u} className="hub-in" strokeWidth={Math.max(1.4, 1.8 * u)} />
          </g>
        </svg>
        <div className="hub-icon a-blur" style={d(2650, { left: hx, top: hy, width: 14 * u, height: 14 * u })}>
          <Store />
        </div>
        <div className="hub-pill a-blur" style={d(4400, { left: hx + 60 * u, top: hy + 24 * u })}>
          <Store />
          {HUB.label}
        </div>
        {dests.map((x, i) => (
          <button key={x.id} className={`map-pill ${x.label} a-blur`} style={d(3450 + ((i * 5) % 11) * 85, { left: x.px, top: x.py, ['--r' as string]: `${x.r + 7 * u}px`, ['--b' as string]: '0.75rem' })} onClick={() => setSel(x.id)}>
            <span>{x.name}</span>
            <b>{x.count.toLocaleString('en-IN')}</b>
          </button>
        ))}
      </div>

      <div className="offers net">
        <header className="hdr">
          <div className="hdr-top a-blur" style={d(180)}>
            <span className="chip-live">Rollout</span>
            <span className="hdr-status">
              <i className="dot lime-dot" />
              Singapore live in this demo
            </span>
          </div>
          <h1 className="hdr-title a-blur" style={d(230, { ['--b' as string]: '0.8rem' })}>
            Supply network
          </h1>
          <div className="hdr-meta a-blur" style={d(330)}>
            <span>
              <CalendarRange />
              6-month rollout
            </span>
            <span>
              <Globe />
              {DESTINATIONS.length} outbound markets
            </span>
          </div>
        </header>

        <aside className="col col-left">
          <Panel delay={1250} className="p-request">
            <PanelHead delay={1300} icon={<Route />} title="Rollout plan" action={<></>} />
            <div className="big-row">
              <div className="big a-blur" style={d(1350)}>
                <span className="big-num">6</span>
                <span className="big-unit">months</span>
              </div>
              <span className="chip-delta a-blur" style={d(1400)}>
                zero downtime
              </span>
            </div>
            <div className="sub a-blur" style={d(1400)}>
              Runs beside TBO search first, then becomes the default view
            </div>
            <div className="rows">
              <BarRow delay={1450} label="Shadow mode, Singapore" kind="M1 to M2" value="Live" frac={1} tone="lime" />
              <BarRow delay={1520} label="Default view, Gulf" kind="M3 to M4" value="Next" frac={0.66} />
              <BarRow delay={1590} label="Agent-ready offer API" kind="M5 to M6" value="Plan" frac={0.33} />
              <BarRow delay={1660} label="Human review queue" kind="throughout" value="On" frac={0.8} tone="dim" />
            </div>
          </Panel>
          <Panel delay={1450} className="p-match">
            <PanelHead delay={1500} icon={<Combine />} title="Singapore, measured" onAction={() => go('benchmark')} actionLabel="Open benchmark" />
            <div className="big-row">
              <div className="big a-blur" style={d(1550)}>
                <span className="big-num">{variants}</span>
                <span className="big-unit">variants</span>
              </div>
              <span className="chip-delta a-blur" style={d(1600)}>
                from {data.records.length} records
              </span>
            </div>
            <div className="sub a-blur" style={d(1600)}>
              {data.res.entities.length} attractions and {data.hotels.properties.length} hotels resolved in this browser
            </div>
            <Histogram bins={h.bins} tone={h.decision} delay={1700} />
            <Legend3
              delay={1950}
              items={[
                { label: 'Auto-linked', value: `${h.shares[0]}%`, color: 'var(--lime)' },
                { label: 'Arbiter', value: `${h.shares[1]}%`, color: '#c9cbc7' },
                { label: 'Kept apart', value: `${h.shares[2]}%`, color: 'rgba(255,255,255,0.25)' },
              ]}
            />
          </Panel>
        </aside>

        <aside className="col col-right">
          <MarketPanel s={s} live={live} />
          <Panel delay={1900} className="p-ranked">
            <PanelHead delay={1950} icon={<Layers />} title="Markets by rollout" action={<></>} />
            <div className="tbl-head a-blur" style={d(2000)}>
              <span>Market</span>
              <span>Status</span>
              <span>Suppl.</span>
            </div>
            <div className="tbl-body">
              {[...dests].sort((a, b) => order(a) - order(b) || b.raw - a.raw).slice(0, 5).map((x, i) => (
                <div key={x.id} className={`tbl-row a-blur ${x.id === sel ? 'sel' : ''}`} style={d(2050 + i * 75)} onClick={() => setSel(x.id)} role="button" tabIndex={0}>
                  <span className="tbl-who">
                    <span className={`thumb st-${x.rollout}`}>
                      <MapPin />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <div className="tbl-name">{x.name}</div>
                      <div className="tbl-sub">{x.phase}</div>
                    </span>
                  </span>
                  <span className={`tbl-mid ${x.rollout === 'live' ? 'lime' : ''}`}>{x.rollout === 'live' ? 'Live' : x.rollout === 'shadow' ? 'Next' : 'Plan'}</span>
                  <span className="tbl-score">{x.suppliers}</span>
                </div>
              ))}
            </div>
            <button className="btn-wide a-blur" style={d(2450)} onClick={() => go('offers')}>
              Open Singapore offers
              <ArrowRight />
            </button>
          </Panel>
        </aside>
      </div>

      <div className="toolbar a-blur" style={d(2000)}>
        <div className="pill-bar tb-legend" aria-label="Map legend">
          <span>
            <i className="dot" style={{ background: 'var(--lime)' }} />
            {STATUS_LABEL.live}
          </span>
          <span>
            <i className="dot" style={{ background: '#fff' }} />
            {STATUS_LABEL.shadow}
          </span>
          <span>
            <i className="dot" style={{ background: 'rgba(255,255,255,0.45)' }} />
            {STATUS_LABEL.planned}
          </span>
        </div>
        <div className="pill-bar tb-note">Market sizes outside Singapore are illustrative</div>
      </div>
    </>
  )
}

const order = (x: Destination) => ({ live: 0, shadow: 1, planned: 2 })[x.rollout]

function MarketPanel({ s, live }: { s: Destination & { count: number }; live: number }) {
  const { data } = useStore()
  const isLive = s.rollout === 'live'
  return (
    <Panel delay={1800} className="p-cluster" key={s.id}>
      <PanelHead delay={1850} icon={<MapPin />} title={`${s.name}`} onAction={() => isLive && go('offers')} actionLabel="Open offers" />
      <div className="chips a-blur" style={d(1950)}>
        <span className="chip">
          <MapPin className="lime" />
          {s.region}
        </span>
        <span className="chip">{s.kmFromHub.toLocaleString('en-IN')} km from Mumbai</span>
      </div>
      <div className="tiles">
        {isLive ? (
          <>
            <Tile delay={2150} icon={<Layers />} label="Supplier records" value={data.records.length} />
            <Tile delay={2200} icon={<GitBranch />} label="Variants" value={live} />
            <Tile delay={2300} icon={<Building2 />} label="Hotels merged" value={data.hotels.properties.length} />
            <Tile delay={2350} icon={<Percent />} label="False merges" value="0.3" unit="%" />
          </>
        ) : (
          <>
            <Tile delay={2150} icon={<Layers />} label="Listings, est." value={`${(s.raw / 1000).toFixed(1)}k`} />
            <Tile delay={2200} icon={<Store />} label="Suppliers" value={s.suppliers} />
            <Tile delay={2300} icon={<GitBranch />} label="Products, est." value={`${(s.canonical / 1000).toFixed(1)}k`} />
            <Tile delay={2350} icon={<Route />} label="Phase" value={s.rollout === 'shadow' ? '2' : '3'} />
          </>
        )}
      </div>
      <div className="bars-head a-blur" style={d(2300)}>
        <span>{isLive ? 'Demo status' : s.phase}</span>
        <b>{isLive ? 'Live' : s.rollout === 'shadow' ? 'Next' : 'Planned'}</b>
      </div>
      <div className="bars">
        {s.months.map((v, i) => (
          <i key={i} className={`a-grow-y ${i === s.months.length - 1 ? 'on' : ''}`} style={d(2500 + i * 38, { height: `${Math.max(14, (v / Math.max(...s.months)) * 100)}%` })} title={`Month ${i + 1}: bookings index ${v}`} />
        ))}
      </div>
    </Panel>
  )
}
