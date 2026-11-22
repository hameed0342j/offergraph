import type { CSSProperties, ReactNode } from 'react'
import { ArrowUpRight, Binoculars, Bus, Castle, Fish, FlaskConical, Footprints, Leaf, PawPrint, Sailboat, Ticket, TreePalm } from 'lucide-react'
import type { MarkKind } from '../data/suppliers'
import type { CatalogEntity } from '../engine/types'
import photoList from '../data/photos.json'
import './kit.css'

export const d = (ms: number, extra?: CSSProperties): CSSProperties => ({ ['--d' as string]: `${ms}ms`, ...extra })

export function Panel({ children, className = '', style, delay = 0 }: { children: ReactNode; className?: string; style?: CSSProperties; delay?: number }) {
  return (
    <section className={`panel a-blur ${className}`} style={{ ...d(delay, { ['--b' as string]: '0.6rem', ['--dur' as string]: '700ms' }), ...style }}>
      {children}
    </section>
  )
}

export function PanelHead({ icon, title, action, delay = 0, onAction, actionLabel = 'Open' }: { icon: ReactNode; title: ReactNode; action?: ReactNode; delay?: number; onAction?: () => void; actionLabel?: string }) {
  return (
    <div className="ph a-blur" style={d(delay)}>
      <span className="ph-icon">{icon}</span>
      <span className="ph-title">{title}</span>
      <span className="ph-spacer" />
      {action ?? (
        <button className="icon-btn" aria-label={actionLabel} title={actionLabel} onClick={onAction}>
          <ArrowUpRight strokeWidth={2} />
        </button>
      )}
    </div>
  )
}

export function BarRow({ label, kind, value, frac, tone = 'grey', delay = 0 }: { label: string; kind?: string; value: ReactNode; frac: number; tone?: 'grey' | 'lime' | 'dim'; delay?: number }) {
  return (
    <div className="a-blur" style={d(delay, { ['--b' as string]: '0.45rem' })}>
      <div className="row-top">
        <span className="row-label">
          <span>{label}</span>
          {kind && <em className="row-kind">{kind}</em>}
        </span>
        <span className="row-val">{value}</span>
      </div>
      <div className="track">
        <div className={`fill ${tone} a-grow-x`} style={d(delay + 60, { width: `${Math.max(2, Math.min(100, frac * 100))}%` })} />
      </div>
    </div>
  )
}

export function Histogram({ bins, tone, delay = 0 }: { bins: number[]; tone: string[]; delay?: number }) {
  const max = Math.max(...bins, 1)
  return (
    <div className="hist" aria-hidden>
      {bins.map((b, i) => (
        <i key={i} className={`${tone[i]} a-grow-y`} style={d(delay + i * 22, { height: `${Math.max(6, Math.sqrt(b / max) * 100)}%` })} />
      ))}
    </div>
  )
}

export function Legend3({ items, delay = 0 }: { items: { label: string; value: string; color: string }[]; delay?: number }) {
  return (
    <div className="legend3 a-blur" style={d(delay)}>
      {items.map((it) => (
        <div key={it.label} style={{ ['--c' as string]: it.color }}>
          <small>{it.label}</small>
          <b>{it.value}</b>
        </div>
      ))}
    </div>
  )
}

export function Tile({ icon, label, value, unit, delay = 0 }: { icon: ReactNode; label: string; value: ReactNode; unit?: string; delay?: number }) {
  return (
    <div className="tile a-blur" style={d(delay, { ['--b' as string]: '0.6rem' })}>
      <div className="tile-label">
        {icon}
        <span>{label}</span>
      </div>
      <div className="tile-val">
        {value}
        {unit && <small>{unit}</small>}
      </div>
    </div>
  )
}

export function Bars({ values, on, warn = [], delay = 0, title }: { values: number[]; on: number; warn?: number[]; delay?: number; title?: (i: number) => string }) {
  const max = Math.max(...values, 1)
  return (
    <div className="bars">
      {values.map((v, i) => (
        <i
          key={i}
          title={title?.(i)}
          className={`a-grow-y ${i === on ? 'on' : ''} ${warn.includes(i) ? 'warn' : ''}`}
          style={d(delay + i * 38, { height: `${Math.max(14, (v / max) * 100)}%` })}
        />
      ))}
    </div>
  )
}

const GLYPH: Record<MarkKind, ReactNode> = {
  asterisk: (
    <g strokeWidth="2.6" strokeLinecap="round">
      <path d="M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3 6.3 17.7" />
    </g>
  ),
  grid: (
    <g>
      <rect x="5" y="5" width="6" height="6" rx="1.2" />
      <rect x="13" y="5" width="6" height="14" rx="1.2" />
      <rect x="5" y="13" width="6" height="6" rx="1.2" />
    </g>
  ),
  peak: <path d="M3 19 9.5 7l3.6 6.2L15.4 10 21 19Z" />,
  waves: (
    <g strokeWidth="2" strokeLinecap="round" fill="none">
      <path d="M5 6v12M9 4v16M13 6v12M17 8v8M21 10v4M1 10v4" />
    </g>
  ),
  arc: <path d="M5 18c0-7 4-12 14-12v4c-7 0-10 3-10 8Z" />,
  sun: (
    <g>
      <circle cx="12" cy="12" r="4.2" />
      <g strokeWidth="2" strokeLinecap="round">
        <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
      </g>
    </g>
  ),
  diamond: <path d="m12 3 8 9-8 9-8-9Z" />,
  drop: <path d="M12 3c3.5 4.6 6 8 6 11a6 6 0 0 1-12 0c0-3 2.5-6.4 6-11Z" />,
}

export function SupplierMark({ kind, tile, ink, size }: { kind: MarkKind; tile: string; ink: string; size?: string }) {
  return (
    <span className="mark" style={{ background: tile, width: size, height: size }}>
      <svg viewBox="0 0 24 24" fill={ink} stroke={ink}>
        {GLYPH[kind]}
      </svg>
    </span>
  )
}

const CAT_ICON: Record<CatalogEntity['category'], ReactNode> = {
  wildlife: <PawPrint />,
  'theme park': <Castle />,
  aquarium: <Fish />,
  viewpoint: <Binoculars />,
  garden: <Leaf />,
  cruise: <Sailboat />,
  show: <Ticket />,
  museum: <FlaskConical />,
  outdoor: <TreePalm />,
  tour: <Bus />,
}

export function Thumb({ photo, category, size }: { photo?: string; category: CatalogEntity['category']; size?: string }) {
  return (
    <span className="thumb" style={size ? { width: size, height: size } : undefined}>
      {photo && PHOTOS.has(photo) ? <img src={`/photos/${photo}.jpg`} alt="" loading="lazy" /> : (CAT_ICON[category] ?? <Footprints />)}
    </span>
  )
}

/** photos available in public/photos (written by scripts/fetch_photos.py, with credits) */
export const PHOTOS = new Set<string>((photoList as { id: string }[]).map((p) => p.id))
