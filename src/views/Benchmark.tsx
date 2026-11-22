import { useEffect, useState } from 'react'
import { Beaker, Combine, FileSearch, Gauge, ListChecks, Timer } from 'lucide-react'
import { runBenchmark, type BenchResult } from '../engine/bench'
import { useStore } from '../state/store'
import { BarRow, d, Panel, PanelHead } from '../ui/kit'
import photos from '../data/photos.json'
import './benchmark.css'

const photoCount = (photos as unknown[]).length

const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`

export function BenchmarkView() {
  const { data, now } = useStore()
  const [b, setB] = useState<BenchResult | null>(null)
  const [ms, setMs] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => {
      const t0 = performance.now()
      const r = runBenchmark(data.parsed, data.res, now)
      setMs(performance.now() - t0)
      setB(r)
    }, 60)
    return () => clearTimeout(t)
    // run once per visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const hr = data.hotels

  return (
    <div className="page bench">
      <header className="cmp-hdr a-blur" style={d(80)}>
        <div>
          <div className="hdr-top">
            <span className="chip-live">Benchmark</span>
            <span className="hdr-status">
              <i className="dot lime-dot" />
              {b ? `${b.queries} labelled queries over ${b.records} supplier records, computed in this browser in ${Math.round(ms)} ms` : 'Running the benchmark in this browser…'}
            </span>
          </div>
          <h1 className="hdr-title">Measured, not claimed</h1>
        </div>
      </header>

      {b && (
        <>
          <div className="sys-row">
            {b.systems.map((s, i) => (
              <Panel key={s.key} delay={140 + i * 80} className={`sys ${s.key === 'proposed' ? 'ours' : ''}`}>
                <PanelHead icon={s.key === 'proposed' ? <Gauge /> : <FileSearch />} title={s.label} action={<span className={`count-pill ${s.key === 'proposed' ? 'lime' : ''}`}>{s.key === 'proposed' ? 'ours' : 'baseline'}</span>} />
                <div className="big">
                  <span className="big-num">{s.score.ndcg10.toFixed(2)}</span>
                  <span className="big-unit">NDCG@10</span>
                </div>
                <div className="rows">
                  <BarRow label="Precision@10" value={s.score.p10.toFixed(2)} frac={s.score.p10} tone={s.key === 'proposed' ? 'lime' : 'grey'} delay={260 + i * 80} />
                  <BarRow label="Recall@10" value={s.score.r10.toFixed(2)} frac={s.score.r10} tone={s.key === 'proposed' ? 'lime' : 'grey'} delay={300 + i * 80} />
                  <BarRow label="Breaks a must-have" kind="lower is better" value={pct(s.score.violations, 1)} frac={s.score.violations} tone="dim" delay={340 + i * 80} />
                  <BarRow label="Duplicate slots" kind="lower is better" value={pct(s.score.duplicates, 1)} frac={s.score.duplicates} tone="dim" delay={380 + i * 80} />
                </div>
              </Panel>
            ))}
          </div>

          <div className="bench-row">
            <Panel delay={420} className="b-match">
              <PanelHead icon={<Combine />} title="Matching quality" action={<></>} />
              <div className="kv">
                <div>
                  <small>Attractions, pairwise</small>
                  <b>P {b.matching.entityP.toFixed(3)}</b>
                  <b>R {b.matching.entityR.toFixed(3)}</b>
                </div>
                <div>
                  <small>Variants, pairwise</small>
                  <b>P {b.matching.variantP.toFixed(3)}</b>
                  <b>R {b.matching.variantR.toFixed(3)}</b>
                </div>
                <div>
                  <small>Hotels, pairwise</small>
                  <b>P {hr.eval.propertyP.toFixed(3)}</b>
                  <b>R {hr.eval.propertyR.toFixed(3)}</b>
                </div>
              </div>
              <div className="b-label">False merges: share of merged pairs that are different products</div>
              <div className="rows">
                {b.matching.falseMerge.map((f, i) => (
                  <BarRow key={f.name} label={f.name} value={pct(f.rate, 1)} frac={f.rate} tone={i === 2 ? 'lime' : 'grey'} delay={480 + i * 60} />
                ))}
              </div>
            </Panel>

            <Panel delay={480} className="b-attr">
              <PanelHead icon={<ListChecks />} title="Attribute extraction" action={<></>} />
              <div className="attr-head">
                <span>Axis</span>
                <span>Stated</span>
                <span>Correct when stated</span>
              </div>
              {b.attributes.map((a, i) => (
                <div key={a.name} className="attr a-blur" style={d(540 + i * 40)}>
                  <span>{a.name}</span>
                  <span className="num">{pct(a.coverage)}</span>
                  <span className="attr-acc">
                    <i style={{ width: `${a.accuracy * 100}%` }} />
                    <b className="num">{pct(a.accuracy, 1)}</b>
                  </span>
                </div>
              ))}
              <div className="attr a-blur" style={d(540 + b.attributes.length * 40)}>
                <span>Hotel room key</span>
                <span className="num">100%</span>
                <span className="attr-acc">
                  <i style={{ width: `${hr.eval.roomAccuracy * 100}%` }} />
                  <b className="num">{pct(hr.eval.roomAccuracy, 1)}</b>
                </span>
              </div>
            </Panel>

            <Panel delay={540} className="b-method">
              <PanelHead icon={<Beaker />} title="Method and limits" action={<></>} />
              <div className="lat">
                <div>
                  <Timer />
                  <span>
                    Intent + ranking
                    <b>
                      p50 {b.latency.p50.toFixed(1)} ms, p95 {b.latency.p95.toFixed(1)} ms
                    </b>
                  </span>
                </div>
                <div>
                  <ListChecks />
                  <span>
                    Intent parsing
                    <b>{pct(b.intentAccuracy)} of queries exact</b>
                  </span>
                </div>
              </div>
              <ul className="method">
                <li>
                  Data: {b.records} labelled synthetic records, {b.entities} attractions, 7 fictional suppliers; {hr.records.length} hotel listings for 12 real properties.
                </li>
                <li>Queries: {b.queries} requests with known must-haves; relevant = meets every must-have.</li>
                <li>Baselines: BM25 keyword search; fuzzy title merge with keyword filters, cheapest first.</li>
                <li>Room and hotel numbers are optimistic: the parser covers the synthetic vocabulary.</li>
                <li>No conversion claims: those need a live pilot on TBO traffic.</li>
              </ul>
              <div className="credits">
                <small>Credits</small>
                <p>
                  City map: Sentinel-2 cloudless 2016 by EOX IT Services GmbH, contains modified Copernicus Sentinel data, CC BY 4.0. Regional map: NASA Blue Marble and Black Marble, public domain. Photos: {photoCount} images from Wikimedia Commons (CC0, CC BY, CC BY-SA), authors listed in the README. Supplier names are fictional; prices and metrics are synthetic.
                </p>
              </div>
              {b.intentMisses.length > 0 && (
                <div className="misses">
                  <small>Phrasings the rule parser still misses</small>
                  {b.intentMisses.slice(0, 1).map((m) => (
                    <q key={m}>{m}</q>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}
