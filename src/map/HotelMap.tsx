import { useMemo } from 'react'
import listingPoints from '../data/sg/listing-points.json'
import type { Viewport } from '../lib/viewport'
import { useStore, fmtINR } from '../state/store'
import { d } from '../ui/kit'
import { CITY, cityPx } from './cityProjection'
import './map.css'

const WORLD = 256 * 2 ** 13
const PX_PER_DEG = WORLD / 360

/** Hotels page map: every canonical property as a pin, the selected one lit, labels never overlap. */
export function HotelMap({ vp }: { vp: Viewport }) {
  const { data, hotel, setHotel } = useStore()
  const u = vp.mobile ? vp.w / 470 : vp.unit
  const mapH = vp.mobile ? Math.round(vp.h * 0.5) : vp.h
  // frame Orchard to Marina in the free area between the columns and above the rooms panel
  const cam = useMemo(() => {
    const ppd = vp.mobile ? vp.w / 0.12 : 3600 * u
    const k = ppd / PX_PER_DEG
    const ax = vp.w / 2
    const ay = vp.mobile ? mapH * 0.5 : (56 * u + (vp.h - 330 * u)) / 2
    const [cx, cy] = cityPx(103.845, 1.2985)
    return { k, tx: ax - cx * k, ty: ay - cy * k }
  }, [vp, u, mapH])
  const pt = (lon: number, lat: number): [number, number] => {
    const [x, y] = cityPx(lon, lat)
    return [x * cam.k + cam.tx, y * cam.k + cam.ty]
  }

  const props = data.hotels.properties.map((p) => {
    const [x, y] = pt(p.lon, p.lat)
    return { p, x, y, r: (p.stars >= 5 ? 10 : p.stars >= 4 ? 8 : 6.5) * u, sel: p.id === hotel }
  })

  // greedy label placement: selected first, then by listings merged; skip anything that would overlap
  const placed: [number, number, number, number][] = []
  const labels: { id: string; x: number; y: number; side: 'left' | 'right'; name: string; n: number }[] = []
  for (const it of [...props].sort((a, b) => Number(b.sel) - Number(a.sel) || b.p.records.length - a.p.records.length)) {
    const name = it.p.name.replace(/ Singapore$/i, '').replace(/^The /, '')
    const w = (name.length * 5.4 + 30) * u
    const h = 20.5 * u
    for (const side of ['right', 'left'] as const) {
      const x0 = side === 'right' ? it.x + it.r + 6 * u : it.x - it.r - 6 * u - w
      const rect: [number, number, number, number] = [x0, it.y - h / 2, x0 + w, it.y + h / 2]
      // the selected property always gets its label; others must clear pins, labels and the columns
      const hitsPin = !it.sel && props.some((o) => o !== it && o.x + o.r > rect[0] && o.x - o.r < rect[2] && o.y + o.r > rect[1] && o.y - o.r < rect[3])
      const hitsLabel = placed.some((q) => rect[0] < q[2] && rect[2] > q[0] && rect[1] < q[3] && rect[3] > q[1])
      const inColumns = !vp.mobile && (rect[0] < 272 * u || rect[2] > vp.w - 274 * u)
      if (!hitsPin && !hitsLabel && !inColumns && rect[0] > 6 * u && rect[2] < vp.w - 6 * u) {
        placed.push(rect)
        labels.push({ id: it.p.id, x: rect[0], y: rect[1], side, name, n: it.p.records.length })
        break
      }
    }
  }

  const dots = (listingPoints as [number, number, number][])
    .map(([lon, lat, w]) => ({ p: pt(lon, lat), w }))
    .filter(({ p }) => p[0] > 0 && p[1] > 0 && p[0] < vp.w && p[1] < mapH && props.every((o) => Math.hypot(p[0] - o.x, p[1] - o.y) > o.r + 6 * u))
  const sel = props.find((x) => x.sel)

  return (
    <div className={`city ${vp.mobile ? 'mobile' : ''}`} style={{ height: mapH }}>
      <div className="city-world" style={{ transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.k})`, width: CITY.width, height: CITY.height }}>
        <img className="city-img" src="/map/city-sg.jpg" width={CITY.width} height={CITY.height} alt="" draggable={false} />
      </div>
      <div className="city-light" />
      <div className="city-vignette" />
      <svg className="city-svg" width={vp.w} height={mapH} aria-hidden>
        <g className="a-fade" style={d(900, { ['--dur' as string]: '900ms' })}>
          {dots.map(({ p, w }, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r={(0.8 + w * 0.6) * u} fill="#fff" opacity={0.18 + w * 0.32} />
          ))}
        </g>
        {props.map((it, i) => (
          <g key={it.p.id} className={`cl ${it.sel ? 'eligible sel' : it.p.stars >= 4 ? 'partial' : 'excluded'} hit`} onClick={() => setHotel(it.p.id)}>
            <title>{`${it.p.name}: ${it.p.records.length} supplier listings merged, from ${fmtINR(it.p.from)}`}</title>
            <g className="a-scale" style={d(1100 + i * 60)}>
              {it.sel && <circle cx={it.x} cy={it.y} r={it.r + 7 * u} className="ring-out" strokeWidth={Math.max(1, u)} strokeDasharray={`${2 * u} ${2.6 * u}`} />}
              <circle cx={it.x} cy={it.y} r={it.r} className="disc" strokeWidth={Math.max(1.2, 1.5 * u)} strokeDasharray={it.p.stars < 4 && !it.sel ? `${2 * u} ${2.4 * u}` : undefined} />
              <circle cx={it.x} cy={it.y} r={2.2 * u} className="core" />
            </g>
          </g>
        ))}
      </svg>
      {labels.map((l, i) => (
        <button key={l.id} className={`map-pill a-blur ${l.id === hotel ? 'sel-pill' : ''}`} style={d(1500 + i * 70, { left: l.x, top: l.y, ['--b' as string]: '0.7rem' })} onClick={() => setHotel(l.id)} aria-label={`Select ${l.name}`}>
          <span>{l.name}</span>
          <b>{l.n}</b>
        </button>
      ))}
      {sel && <div className="hotel-sel-glow" style={{ left: sel.x, top: sel.y, width: sel.r * 7, height: sel.r * 7 }} />}
    </div>
  )
}
