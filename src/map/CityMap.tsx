import { useEffect, useMemo, useState } from 'react'
import { BedDouble, TrendingDown, TrendingUp, Ban, RotateCcw } from 'lucide-react'
import { CLUSTERS, HOTEL } from '../data/sg/catalog'
import { SUPPLIER_BY_ID } from '../data/suppliers'
import type { Result, Status } from '../engine/rank'
import { useStore, fmtINR } from '../state/store'
import type { Viewport } from '../lib/viewport'
import { d, SupplierMark, Thumb } from '../ui/kit'
import { CITY, camPoint, cityCamera } from './cityProjection'
import listingPoints from '../data/sg/listing-points.json'
import './map.css'

interface ClusterView {
  id: string
  name: string
  area: string
  x: number
  y: number
  r: number
  status: Status
  eligible: number
  records: number
  entities: Result[] // best result per entity in this cluster, ranked
  transferMin: number
  label: 'left' | 'right' | 'top' | 'bottom'
}

const ORDER: Record<Status, number> = { eligible: 0, partial: 1, excluded: 2 }

export function CityMap({ vp, dim = false, interactive = true }: { vp: Viewport; dim?: boolean; interactive?: boolean }) {
  const { data, ranking, cluster, selectCluster, events } = useStore()

  const mapH = vp.mobile ? Math.round(vp.h * 0.58) : vp.h
  const cam = useMemo(() => cityCamera(vp.w, mapH, vp.unit, vp.mobile), [vp.w, mapH, vp.unit, vp.mobile])
  const u = cam.unit

  const clusters: ClusterView[] = useMemo(() => {
    return CLUSTERS.map((c) => {
      const [x, y] = camPoint(cam, c.lon, c.lat)
      const ents = data.res.entities.filter((e) => e.cluster === c.id)
      const records = ents.reduce((s, e) => s + e.records, 0)
      const results = ranking.results.filter((r) => r.entity.cluster === c.id)
      const seen = new Set<string>()
      const best = results.filter((r) => !seen.has(r.entity.id) && (seen.add(r.entity.id), true))
      const status = results.reduce<Status>((s, r) => (ORDER[r.status] < ORDER[s] ? r.status : s), 'excluded')
      const eligible = results.reduce((s, r) => s + (r.status === 'eligible' ? r.offers.filter((o) => o.eligible).length : 0), 0)
      const rad = Math.max(12, Math.min(29, 9 + Math.sqrt(records) * 2.7)) * u
      return { id: c.id, name: c.name, area: c.area, x, y, r: rad, status, eligible, records, entities: best, transferMin: c.transferMin, label: c.label }
    })
  }, [cam, data, ranking, u])

  const [hx, hy] = camPoint(cam, HOTEL.lon, HOTEL.lat)
  const sel = clusters.find((c) => c.id === cluster) ?? clusters[0]

  // hotel properties and listing dots: real data, kept clear of the clusters and the hub
  const clear = (x: number, y: number, pad: number) => Math.hypot(x - hx, y - hy) > 24 * u + pad && clusters.every((c) => Math.hypot(x - c.x, y - c.y) > c.r + pad)
  const hotels = useMemo(
    () =>
      data.hotels.properties
        .map((h) => ({ h, p: camPoint(cam, h.lon, h.lat) }))
        .filter(({ p }) => clear(p[0], p[1], 12 * u)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, cam, clusters],
  )
  const dots = useMemo(
    () =>
      (listingPoints as [number, number, number][])
        .map(([lon, lat, w]) => ({ p: camPoint(cam, lon, lat), w }))
        .filter(({ p }) => p[0] > 0 && p[1] > 0 && p[0] < vp.w && p[1] < mapH && clear(p[0], p[1], 6 * u))
        // keep the header and the nav clean
        .filter(({ p }) => !(p[0] < 300 * u && p[1] < 120 * u) && !(Math.abs(p[0] - vp.w / 2) < 210 * u && p[1] < 50 * u))
        .filter((_, i) => i % 4 !== 3),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cam, clusters, vp.w, mapH],
  )

  // links from the hotel to clusters that have something to offer
  const links = clusters
    .map((c, i) => {
      const dx = c.x - hx
      const dy = c.y - hy
      const len = Math.hypot(dx, dy)
      const ux = dx / len
      const uy = dy / len
      const sx = hx + ux * 19 * u
      const sy = hy + uy * 19 * u
      const ex = c.x - ux * (c.r + 3 * u)
      const ey = c.y - uy * (c.r + 3 * u)
      const bend = (i % 2 ? 1 : -1) * len * 0.12
      const mx = (sx + ex) / 2 - uy * bend
      const my = (sy + ey) / 2 + ux * bend
      return { c, len, d: `M${sx},${sy} Q${mx},${my} ${ex},${ey}`, mid: [(sx + 2 * mx + ex) / 4, (sy + 2 * my + ey) / 4] as [number, number] }
    })
  // label the two longest links that lead somewhere useful, so labels never sit on the hub
  const labelled = [...links].filter((l) => l.c.status === 'eligible' && l.len > 120 * u).sort((a, b) => b.len - a.len).slice(0, 2).map((l) => l.c.id)

  const pop = placePopover(sel, clusters, hx, hy, vp, u)

  // supplier change event on the map, visible for 7 seconds
  const [tick, setTick] = useState(0)
  const latest = events[0]
  useEffect(() => {
    if (!latest) return
    const t = setTimeout(() => setTick((x) => x + 1), 7200)
    return () => clearTimeout(t)
  }, [latest])
  const showEvent = latest && Date.now() - latest.at < 7000 && tick >= 0
  const evCluster = showEvent ? clusters.find((c) => c.id === latest.cluster) : null

  const pillOrder = [3, 0, 6, 1, 8, 4, 2, 7, 5]

  return (
    <div className={`city ${dim ? 'dim' : ''} ${vp.mobile ? 'mobile' : ''}`} style={{ height: mapH }}>
      <div className="city-world" style={{ transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.k})`, width: CITY.width, height: CITY.height }}>
        <img className="city-img" src="/map/city-sg.jpg" width={CITY.width} height={CITY.height} alt="" draggable={false} />
      </div>
      <div className="city-light" />
      <div className="city-vignette" />

      {!dim && (
        <>
          <svg className="city-svg" width={vp.w} height={mapH} aria-hidden>
            <defs>
              {links.map((l, i) => (
                <mask id={`lk${i}`} key={l.c.id} maskUnits="userSpaceOnUse">
                  <path d={l.d} stroke="#fff" strokeWidth={6} fill="none" pathLength={1} strokeDasharray="1 1" className="a-draw" style={d(2800 + i * 75, { ['--len' as string]: 1, ['--dur' as string]: '800ms' })} />
                </mask>
              ))}
            </defs>
            {links.map((l, i) => (
              <path key={l.c.id} d={l.d} mask={`url(#lk${i})`} className={`link ${l.c.id === sel.id ? 'sel' : ''} ${l.c.status === 'excluded' ? 'faint' : ''}`} strokeWidth={Math.max(1, 1.05 * u)} strokeDasharray={`${3 * u} ${3 * u}`} />
            ))}

            {/* popover connector */}
            {pop && (
              <g className="a-fade" style={d(4200, { ['--dur' as string]: '400ms' })}>
                <line x1={pop.sx} y1={pop.sy} x2={pop.ex} y2={pop.ey} className="connector" strokeWidth={Math.max(1, u)} />
                <circle cx={pop.sx} cy={pop.sy} r={2.4 * u} fill="#fff" />
              </g>
            )}

            <g className="a-fade" style={d(2600, { ['--dur' as string]: '900ms' })}>
              {dots.map(({ p, w }, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r={(0.8 + w * 0.6) * u} fill="#fff" opacity={0.2 + w * 0.38} />
              ))}
            </g>
            {hotels.map(({ h, p }, i) => (
              <g key={h.id} className={`hotel-pin ${h.stars < 4 ? 'faint' : ''}`}>
                <title>{`${h.name}: ${h.records.length} supplier listings merged into one property`}</title>
                <g className="a-scale" style={d(3300 + i * 60)}>
                  <circle className="ring" cx={p[0]} cy={p[1]} r={(h.stars >= 5 ? 7.5 : 6) * u} strokeWidth={Math.max(1, u)} />
                  <circle className="dotc" cx={p[0]} cy={p[1]} r={1.6 * u} />
                </g>
              </g>
            ))}

            {clusters.map((c, i) => (
              <g
                key={c.id}
                className={`cl ${c.status} ${c.id === sel.id ? 'sel' : ''} ${interactive ? 'hit' : ''}`}
                onClick={() => interactive && selectCluster(c.id)}
                role={interactive ? 'button' : undefined}
                aria-label={`${c.name}: ${c.eligible} offers fit the request`}
              >
                <g className="a-scale" style={d(2700 + i * 75, { ['--dur' as string]: '560ms' })}>
                  {c.id === sel.id && <circle cx={c.x} cy={c.y} r={c.r + 7 * u} className="ring-out" strokeWidth={Math.max(1, u)} strokeDasharray={`${2 * u} ${2.6 * u}`} />}
                  {evCluster && evCluster.id === c.id && <circle cx={c.x} cy={c.y} r={c.r + 3.5 * u} className={`ev-ring ${latest.kind}`} strokeWidth={Math.max(1.2, 1.6 * u)} />}
                  <circle cx={c.x} cy={c.y} r={c.r} className="disc" strokeWidth={c.status === 'excluded' ? Math.max(1, u) : Math.max(1.2, 1.6 * u)} strokeDasharray={c.status === 'excluded' ? `${2 * u} ${2.4 * u}` : undefined} />
                  {c.status === 'eligible' && <circle cx={c.x} cy={c.y} r={c.r} className="cover a-fade-out" style={d(3150 + i * 75)} strokeWidth={Math.max(1.2, 1.6 * u)} />}
                  <circle cx={c.x} cy={c.y} r={(c.status === 'excluded' ? 1.9 : 2.5) * u} className="core" />
                </g>
              </g>
            ))}

            {/* hotel hub */}
            <g className="a-resolve" style={d(2500)}>
              <circle cx={hx} cy={hy} r={18.5 * u} className="hub-out" />
              <circle cx={hx} cy={hy} r={13 * u} className="hub-in" strokeWidth={Math.max(1.4, 1.8 * u)} />
            </g>
          </svg>

          <div className="hub-icon a-blur" style={d(2650, { left: hx, top: hy, width: 14 * u, height: 14 * u })}>
            <BedDouble />
          </div>
          <div className="hub-pill a-blur" style={d(4400, { left: hx - 21 * u, top: hy + 3 * u, ['--b' as string]: '1rem' })}>
            <BedDouble />
            {HOTEL.name}
          </div>

          {links
            .filter((l) => labelled.includes(l.c.id))
            .map((l) => (
              <div key={l.c.id} className="link-label a-blur" style={d(3700, { left: l.mid[0], top: l.mid[1] })}>
                <span>drive</span>
                <b>{l.c.transferMin} min</b>
              </div>
            ))}

          {clusters.map((c, i) => (
            <button
              key={c.id}
              className={`map-pill ${c.label} st-${c.status} a-blur`}
              style={d(3450 + pillOrder[i % pillOrder.length] * 85, { left: c.x, top: c.y, ['--r' as string]: `${c.r + 7 * u}px`, ['--b' as string]: '0.75rem', ['--dur' as string]: '520ms' })}
              onClick={() => interactive && selectCluster(c.id)}
              tabIndex={interactive ? 0 : -1}
            >
              <span>{c.name}</span>
              <b>{c.eligible}</b>
            </button>
          ))}

          {pop && (
            <div className="popover a-blur" style={d(4750, { left: pop.x, top: pop.y, width: pop.w, ['--b' as string]: '0.8rem' })} key={sel.id}>
              <div className="pop-head">
                <div>
                  <div className="pop-title">{sel.name} cluster</div>
                  <div className="pop-sub">
                    {sel.entities.length} attractions, {sel.records} records
                  </div>
                </div>
                <span className={`pop-chip ${sel.status}`}>
                  <i className="dot" />
                  {sel.status === 'eligible' ? `${sel.eligible} fit` : sel.status === 'partial' ? 'Check' : 'None fit'}
                </span>
              </div>
              <div className="pop-label">Top attractions here</div>
              <div className="pop-thumbs">
                {sel.entities.slice(0, 5).map((r, i) => (
                  <span key={r.entity.id} className="a-blur" style={d(5000 + i * 80, { ['--b' as string]: '0.6rem' })} title={r.entity.name}>
                    <Thumb photo={r.entity.photo} category={r.entity.category} />
                  </span>
                ))}
                {sel.entities.length > 5 && (
                  <span className="mark more a-blur" style={d(5400)}>
                    +{sel.entities.length - 5}
                  </span>
                )}
              </div>
              <div className="pop-stats a-blur" style={d(5450)}>
                <div>
                  <small>From</small>
                  <b>{bestPrice(sel)}</b>
                </div>
                <div>
                  <small>Transfer</small>
                  <b>{sel.transferMin} min</b>
                </div>
                <div>
                  <small>Best fit</small>
                  <b>{sel.entities[0] ? Math.round(sel.entities[0].score) : '–'}</b>
                </div>
              </div>
            </div>
          )}

          {showEvent && evCluster && (
            <div className={`map-event ${latest.kind}`} style={{ left: vp.mobile ? vp.w / 2 : vp.w / 2, top: vp.mobile ? 14 * u + 46 : 104 * u }} key={latest.id}>
              <SupplierMark kind={SUPPLIER_BY_ID[latest.supplier].mark} tile={SUPPLIER_BY_ID[latest.supplier].tile} ink={SUPPLIER_BY_ID[latest.supplier].ink} size="1.9rem" />
              <span className="ev-text">
                <b>{SUPPLIER_BY_ID[latest.supplier].name} changed a rate</b>
                <span>
                  {latest.entityName}, {latest.variantName.toLowerCase()}
                </span>
              </span>
              <span className="ev-delta">
                {latest.kind === 'price-up' ? <TrendingUp /> : latest.kind === 'price-down' ? <TrendingDown /> : latest.kind === 'sold-out' ? <Ban /> : <RotateCcw />}
                {latest.text}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function bestPrice(c: ClusterView): string {
  const prices = c.entities.flatMap((r) => r.offers.filter((o) => o.eligible).map((o) => o.offer.priceINR))
  if (!prices.length) {
    const all = c.entities.flatMap((r) => r.offers.map((o) => o.offer.priceINR))
    return all.length ? fmtINR(Math.min(...all)) : '–'
  }
  return fmtINR(Math.min(...prices))
}

/** approximate label pill box, matching the .map-pill placement rules */
function pillRect(c: ClusterView, u: number): [number, number, number, number] {
  const w = (c.name.length * 5.4 + 30) * u
  const h = 20.5 * u
  const gap = c.r + 7 * u
  if (c.label === 'left') return [c.x - gap - w, c.y - 1.3 * h, c.x - gap, c.y - 0.3 * h]
  if (c.label === 'right') return [c.x + gap, c.y - 0.3 * h, c.x + gap + w, c.y + 0.7 * h]
  if (c.label === 'top') return [c.x - w / 2, c.y - gap - h, c.x + w / 2, c.y - gap]
  return [c.x - w / 2, c.y + gap, c.x + w / 2, c.y + gap + h]
}

/** Find a spot for the popover that clears the panels, toolbar, hub and other clusters. */
function placePopover(sel: ClusterView, all: ClusterView[], hx: number, hy: number, vp: Viewport, u: number) {
  if (vp.mobile) return null
  const W = vp.w
  const H = vp.h
  const pw = 192 * u
  const ph = 138 * u
  const obstacles: [number, number, number, number][] = [
    [0, 0, 262 * u, H], // left column
    [W - 264 * u, 0, W, H], // right column
    [W / 2 - 262 * u, H - 58 * u, W / 2 + 262 * u, H], // toolbar
    [W / 2 - 240 * u, 0, W / 2 + 240 * u, 56 * u], // nav
    [hx - 26 * u, hy - 26 * u, hx + 26 * u, hy + 26 * u], // hub
    [hx - 130 * u, hy - 4 * u, hx + 10 * u, hy + 26 * u], // hub pill
    ...all.filter((c) => c.id !== sel.id).map((c) => [c.x - c.r - 4 * u, c.y - c.r - 4 * u, c.x + c.r + 4 * u, c.y + c.r + 4 * u] as [number, number, number, number]),
    ...all.map((c) => pillRect(c, u)),
  ]
  const hit = (x: number, y: number) => {
    if (x < 8 * u || y < 8 * u || x + pw > W - 8 * u || y + ph > H - 8 * u) return true
    return obstacles.some(([a, b, c2, d2]) => x < c2 && x + pw > a && y < d2 && y + ph > b)
  }
  const r = sel.r
  const tries: [number, number][] = []
  for (const dy of [r + 32 * u, r + 52 * u, r + 14 * u, -(ph + r + 24 * u), -(ph / 2), r + 80 * u])
    for (const dx of [r + 56 * u, r + 24 * u, -pw / 2, -(pw + r + 24 * u), -(pw + r + 56 * u), r + 100 * u]) tries.push([dx, dy])
  let best: [number, number] | null = null
  for (const [dx, dy] of tries) {
    if (!hit(sel.x + dx, sel.y + dy)) {
      best = [sel.x + dx, sel.y + dy]
      break
    }
  }
  if (!best) best = [Math.min(W - 290 * u - pw, Math.max(290 * u, sel.x + r + 40 * u)), Math.min(H - 70 * u - ph, sel.y + r + 30 * u)]
  const [x, y] = best
  // connector from the circle edge to the nearest point of the card
  const nx = Math.max(x, Math.min(sel.x, x + pw))
  const ny = Math.max(y, Math.min(sel.y, y + ph))
  const ang = Math.atan2(ny - sel.y, nx - sel.x)
  return { x, y, w: pw, sx: sel.x + Math.cos(ang) * (r + 1 * u), sy: sel.y + Math.sin(ang) * (r + 1 * u), ex: nx - Math.cos(ang) * 2 * u, ey: ny - Math.sin(ang) * 2 * u }
}
