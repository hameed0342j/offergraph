import { SlidersHorizontal } from 'lucide-react'
import { MODES, type Mode } from '../engine/rank'
import { useStore } from '../state/store'
import { d } from '../ui/kit'
import { go, PAGES, type Page } from './route'
import './shell.css'

export function Brand() {
  return (
    <svg viewBox="0 0 24 24" className="brand-mark" aria-hidden>
      <circle cx="6" cy="7" r="2.6" />
      <circle cx="18" cy="6" r="2.6" />
      <circle cx="12" cy="18" r="3.2" />
      <path d="M6 7 12 18M18 6 12 18M6 7h12" fill="none" strokeWidth="1.6" />
    </svg>
  )
}

export function TopNav({ page }: { page: Page }) {
  return (
    <nav className="topnav pill-bar a-blur" style={d(2250)} aria-label="Pages">
      <span className="brand">
        <Brand />
        OfferGraph
      </span>
      {PAGES.map((p) => (
        <button key={p.id} className={`pill-btn ${p.id === page ? 'on' : ''}`} onClick={() => go(p.id)} aria-current={p.id === page ? 'page' : undefined}>
          {p.label}
        </button>
      ))}
    </nav>
  )
}

export function Toolbar({ onFilters }: { onFilters?: () => void }) {
  const { mode, setMode, intent } = useStore()
  return (
    <div className="toolbar a-blur" style={d(2000)}>
      <button className="pill-bar tb-filters" onClick={onFilters ?? (() => window.dispatchEvent(new Event('og:edit-request')))} title="Must-haves come from the request: edit it to change them">
        <span className="pill-btn">
          <SlidersHorizontal />
          Must-haves
        </span>
        <span className="badge">{intent.hard.length - (intent.destination ? 1 : 0)}</span>
      </button>
      <div className="pill-bar" role="radiogroup" aria-label="Ranking">
        {(Object.keys(MODES) as Mode[]).map((m) => (
          <button key={m} role="radio" aria-checked={m === mode} className={`pill-btn ${m === mode ? 'on' : ''}`} onClick={() => setMode(m)}>
            {MODES[m].label}
          </button>
        ))}
      </div>
      <div className="pill-bar tb-legend" aria-label="Map legend">
        <span>
          <i className="dot" style={{ background: 'var(--lime)' }} />
          Fits all
        </span>
        <span>
          <i className="dot" style={{ background: '#fff' }} />
          Needs checks
        </span>
        <span>
          <i className="dot" style={{ background: 'rgba(255,255,255,0.45)' }} />
          Excluded
        </span>
      </div>
    </div>
  )
}
