import { useMemo, useState } from 'react'
import { ArrowRight, CircleAlert, Combine, Layers, ListFilter, Rows3, Table2 } from 'lucide-react'
import { SUPPLIER_BY_ID } from '../data/suppliers'
import { clock, SUPPLIER_LABEL, type Result } from '../engine/rank'
import type { Entity, Variant } from '../engine/types'
import { useStore, fmtINR } from '../state/store'
import { d, Panel, PanelHead, SupplierMark, Thumb } from '../ui/kit'
import { go } from '../shell/route'
import './compare.css'

type Axis = { key: string; label: string; get: (v: Variant) => string | null; offer?: boolean }

const AXES: Axis[] = [
  { key: 'transfer', label: 'Transfer', get: (v) => (v.inclusions.transfer === null ? null : v.inclusions.transfer === 'none' ? 'Not included' : v.inclusions.transfer === 'shared' ? 'Shared, hotel pick-up' : 'Private car') },
  { key: 'access', label: 'Access', get: (v) => (v.inclusions.access === 'standard' ? 'Standard entry' : v.inclusions.access === 'fast-track' ? 'Express, skip the line' : 'VIP') },
  { key: 'meals', label: 'Meals', get: (v) => ({ none: 'None', snack: 'Tastings', meal: 'Meal included', fine: 'Fine dining' } as Record<string, string>)[v.inclusions.meals ?? 'none'] },
  { key: 'activities', label: 'Activity options', get: (v) => ((v.inclusions.activities ?? []).length ? (v.inclusions.activities ?? []).join(', ') : 'Entry only') },
  { key: 'duration', label: 'Duration', get: (v) => (v.inclusions.durationH === null ? null : `${v.inclusions.durationH} h`) },
  { key: 'guide', label: 'Guide and language', get: (v) => ({ self: 'Self-guided', audio: 'Audio guide', group: 'Group guide, English', private: 'Private guide, English' } as Record<string, string>)[v.inclusions.guide ?? 'self'] },
]

export function CompareView() {
  const { ranking, data, focus } = useStore()
  const entities = useMemo(() => {
    const seen = new Set<string>()
    const out: { e: Entity; best: Result | null }[] = []
    for (const r of ranking.results) {
      if (seen.has(r.entity.id)) continue
      seen.add(r.entity.id)
      out.push({ e: r.entity, best: r.status === 'excluded' ? null : r })
    }
    return out
  }, [ranking])
  const focusEntity = focus ? ranking.results.find((r) => r.variant.id === focus)?.entity.id : null
  const [sel, setSel] = useState<string>(focusEntity ?? entities.find((x) => x.e.variants.length >= 4)?.e.id ?? entities[0].e.id)
  const [view, setView] = useState<'unified' | 'raw'>('unified')
  const entity = data.res.entities.find((e) => e.id === sel)!
  const results = ranking.results.filter((r) => r.entity.id === sel)

  return (
    <div className="page cmp">
      <header className="cmp-hdr a-blur" style={d(80)}>
        <div>
          <div className="hdr-top">
            <span className="chip-live">Compare</span>
            <span className="hdr-status">
              <i className="dot lime-dot" />
              {entity.records} supplier records, {entity.variants.length} variants
            </span>
          </div>
          <h1 className="hdr-title">{entity.name}</h1>
        </div>
        <div className="pill-bar" role="radiogroup" aria-label="View">
          <button role="radio" aria-checked={view === 'raw'} className={`pill-btn ${view === 'raw' ? 'on' : ''}`} onClick={() => setView('raw')}>
            <Rows3 />
            Raw supplier feed
          </button>
          <button role="radio" aria-checked={view === 'unified'} className={`pill-btn ${view === 'unified' ? 'on' : ''}`} onClick={() => setView('unified')}>
            <Table2 />
            OfferGraph variants
          </button>
        </div>
      </header>

      <div className="cmp-grid">
        <Panel delay={120} className="cmp-list">
          <PanelHead icon={<ListFilter />} title="Attractions for this request" action={<span className="count-pill">{entities.length}</span>} />
          <div className="ent-list scroll">
            {entities.map(({ e, best }) => (
              <button key={e.id} className={`ent-row ${e.id === sel ? 'sel' : ''} ${best ? '' : 'out'}`} onClick={() => setSel(e.id)}>
                <Thumb photo={e.photo} category={e.category} size="2.6rem" />
                <span className="ent-name">
                  {e.name}
                  <small>
                    {e.records} records, {e.variants.length} variants
                  </small>
                </span>
                <span className="ent-score">{best ? Math.round(best.score) : '–'}</span>
              </button>
            ))}
          </div>
        </Panel>

        {view === 'unified' ? <Matrix entity={entity} results={results} key={entity.id + 'm'} /> : <RawFeed entity={entity} key={entity.id + 'r'} />}
      </div>
    </div>
  )
}

function Matrix({ entity, results }: { entity: Entity; results: Result[] }) {
  const byVariant = new Map(results.map((r) => [r.variant.id, r]))
  const cols = [...entity.variants].sort((a, b) => {
    const ra = byVariant.get(a.id)
    const rb = byVariant.get(b.id)
    const o = { eligible: 0, partial: 1, excluded: 2 }
    return o[ra?.status ?? 'excluded'] - o[rb?.status ?? 'excluded'] || (rb?.score ?? 0) - (ra?.score ?? 0)
  })
  const bestId = byVariant.get(cols[0]?.id)?.status === 'eligible' ? cols[0].id : null
  const bc = (v: { id: string }) => (v.id === bestId ? ' best' : '')
  return (
    <Panel delay={180} className="cmp-main">
      <PanelHead icon={<Combine />} title="Variants kept apart by what is included" action={<span className="count-pill">{cols.length}</span>} />
      <p className="sub">Same attraction, different products. Offers are merged only when every inclusion matches; cancellation and price stay with each supplier's offer.</p>
      <div className="mx scroll" style={{ ['--cols' as string]: cols.length }}>
        <div className="mx-row mx-headrow">
          <div className="mx-axis" />
          {cols.map((v, i) => {
            const r = byVariant.get(v.id)
            return (
              <div key={v.id} className={`mx-col-head a-blur ${r?.status ?? 'excluded'}${bc(v)}`} style={d(240 + i * 60)}>
                <span className="mx-head-top">
                  <span className={`fit-dot ${r?.status ?? 'excluded'}`} />
                  {v.id === bestId && <span className="best-tag">Best fit {Math.round(r!.score)}</span>}
                </span>
                <b>{v.name}</b>
                <small>
                  {v.offers.length} supplier{v.offers.length > 1 ? 's' : ''}
                </small>
                <span className="mx-fit">
                  <i style={{ width: `${Math.round(r?.score ?? 0)}%` }} />
                </span>
              </div>
            )
          })}
        </div>
        {AXES.map((a, ai) => {
          const vals = cols.map((v) => a.get(v))
          const differs = new Set(vals.filter((x) => x !== null)).size > 1
          return (
            <div key={a.key} className="mx-row a-blur" style={d(300 + ai * 50)}>
              <div className="mx-axis">
                {a.label}
                {differs && <i>differs</i>}
              </div>
              {vals.map((val, i) => (
                <div key={i} className={`mx-cell ${val === null ? 'unknown' : ''} ${differs && val !== null && val !== vals[0] ? 'diff' : ''}${bc(cols[i])}`}>
                  {val ?? (
                    <>
                      <CircleAlert />
                      Not stated
                    </>
                  )}
                </div>
              ))}
            </div>
          )
        })}
        <div className="mx-sep">Offer terms, per supplier</div>
        {[
          { label: 'Best offer', f: (r?: Result) => (r?.best ? `${fmtINR(r.best.offer.priceINR)}, ${SUPPLIER_LABEL(r.best.offer.supplier)}` : '–') },
          { label: 'Cancellation', f: (r?: Result) => (r?.best ? (r.best.offer.cancelH === null ? null : r.best.offer.cancelH === 0 ? 'Non-refundable' : `Free until ${r.best.offer.cancelH}h before`) : '–') },
          { label: 'Availability', f: (r?: Result) => (r?.best ? ({ instant: 'Instant confirmation', 'on-request': 'On request', 'sold-out': 'Sold out' } as Record<string, string>)[r.best.offer.availability] : '–') },
          { label: 'Payment terms', f: (r?: Result) => (r?.best ? SUPPLIER_BY_ID[r.best.offer.supplier].payment : '–') },
          { label: 'Price checked', f: (r?: Result) => (r?.best ? clock(r.best.offer.checkedAt) : '–') },
          { label: 'Fits the request', f: (r?: Result) => (r ? ({ eligible: 'Yes', partial: 'Needs checks', excluded: 'No' } as Record<string, string>)[r.status] : '–') },
        ].map((row, ri) => (
          <div key={row.label} className="mx-row a-blur" style={d(620 + ri * 50)}>
            <div className="mx-axis">{row.label}</div>
            {cols.map((v) => {
              const r = byVariant.get(v.id)
              const val = row.f(r)
              return (
                <div key={v.id} className={`mx-cell ${val === null ? 'unknown' : ''} ${row.label === 'Fits the request' ? r?.status ?? '' : ''}${bc(v)}`}>
                  {val ?? (
                    <>
                      <CircleAlert />
                      Not stated
                    </>
                  )}
                </div>
              )
            })}
          </div>
        ))}
        <div className="mx-row a-blur" style={d(940)}>
          <div className="mx-axis">Suppliers</div>
          {cols.map((v) => (
            <div key={v.id} className={`mx-cell marks${bc(v)}`}>
              {v.offers.map((o) => {
                const s = SUPPLIER_BY_ID[o.supplier]
                return (
                  <span key={o.id} title={`${s.name}: ${fmtINR(o.priceINR)}`}>
                    <SupplierMark kind={s.mark} tile={s.tile} ink={s.ink} size="1.9rem" />
                  </span>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <button className="btn-wide" onClick={() => go('offers')}>
        Back to ranked offers
        <ArrowRight />
      </button>
    </Panel>
  )
}

function RawFeed({ entity }: { entity: Entity }) {
  const offers = entity.variants.flatMap((v) => v.offers.map((o) => ({ v, o })))
  offers.sort((a, b) => a.o.parsed.record.id.localeCompare(b.o.parsed.record.id))
  return (
    <Panel delay={180} className="cmp-main">
      <PanelHead icon={<Layers />} title="What the supplier feeds deliver" action={<span className="count-pill">{offers.length}</span>} />
      <p className="sub">The same attraction as each supplier sends it: different names, currencies, abbreviations and policy wording. Underlined words are the evidence the parser used.</p>
      <div className="raw-grid scroll">
        {offers.map(({ v, o }, i) => {
          const r = o.parsed.record
          const s = SUPPLIER_BY_ID[r.supplier]
          const ev = [o.parsed.inclusions.transfer.evidence?.text, o.parsed.inclusions.meals.evidence?.text, o.parsed.inclusions.activities.evidence?.text].filter(Boolean) as string[]
          return (
            <div key={r.id} className="raw-card a-blur" style={d(220 + Math.min(i, 16) * 35)}>
              <div className="raw-top">
                <SupplierMark kind={s.mark} tile={s.tile} ink={s.ink} size="2rem" />
                <span className="raw-sup">
                  {s.name}
                  <small>{r.supplierCode}</small>
                </span>
                <span className="raw-price">{r.priceText}</span>
              </div>
              <div className="raw-title">
                <Mark text={r.title} ev={ev} />
              </div>
              {r.description && (
                <div className="raw-desc">
                  <Mark text={r.description} ev={ev} />
                </div>
              )}
              <div className="raw-foot">
                <span>{r.cancellation || 'No cancellation text'}</span>
                <span className="raw-v">→ {v.name}</span>
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function Mark({ text, ev }: { text: string; ev: string[] }) {
  const hit = ev.find((e) => e && text.includes(e))
  if (!hit) return <>{text}</>
  const i = text.indexOf(hit)
  return (
    <>
      {text.slice(0, i)}
      <mark>{hit}</mark>
      {text.slice(i + hit.length)}
    </>
  )
}
