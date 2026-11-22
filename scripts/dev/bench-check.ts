import { generateRecords } from '../../src/data/sg/generate'
import { parseRecord } from '../../src/engine/parse'
import { resolve } from '../../src/engine/resolve'
import { runBenchmark } from '../../src/engine/bench'
const now = Date.parse('2026-11-15T10:42:00+05:30')
const recs = generateRecords(20261115, now)
const parsed = recs.map(parseRecord)
const res = resolve(parsed)
const t0 = performance.now()
const b = runBenchmark(parsed, res, now)
console.log('bench ms', (performance.now() - t0).toFixed(0))
for (const s of b.systems) console.log(s.label.padEnd(26), Object.fromEntries(Object.entries(s.score).map(([k, v]) => [k, +v.toFixed(3)])))
console.log('intent', b.intentAccuracy.toFixed(3), b.intentMisses)
console.log('latency', b.latency)
console.log('matching', b.matching)
console.log('attributes', b.attributes.map((a) => `${a.name} cov ${a.coverage.toFixed(2)} acc ${a.accuracy.toFixed(3)}`))
console.log(b.sample.map((q) => q.text))
