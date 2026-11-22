import { generateRecords } from '../../src/data/sg/generate'
import { parseRecord, coreName } from '../../src/engine/parse'
import { resolve, features, distinct } from '../../src/engine/resolve'
const now = Date.parse('2026-11-15T10:42:00+05:30')
const recs = generateRecords(20261115, now)
const parsed = recs.map(parseRecord)
const res = resolve(parsed)
const by = new Map(recs.map((r) => [r.id, r]))
const P = new Map(parsed.map((p) => [p.record.id, p]))
const bad = res.pairs.filter((p) => (p.decision === 'auto' || p.decision === 'arbiter-same') && by.get(p.a)!.truth.entity !== by.get(p.b)!.truth.entity)
console.log('false links', bad.length)
const seen = new Set<string>()
for (const p of bad) {
  const a = by.get(p.a)!, b = by.get(p.b)!
  const k = [a.truth.entity, b.truth.entity].sort().join('~')
  if (seen.has(k)) continue
  seen.add(k)
  const f = features(P.get(p.a)!, P.get(p.b)!, distinct(coreName(a.title)), distinct(coreName(b.title)))
  console.log(p.decision, p.score.toFixed(3), k, '|', a.title, '[', coreName(a.title).join(' '), '] vs', b.title, '[', coreName(b.title).join(' '), ']', JSON.stringify(f))
}
