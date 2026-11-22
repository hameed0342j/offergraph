import { generateRecords } from '../../src/data/sg/generate'
import { parseRecord } from '../../src/engine/parse'
import { resolve } from '../../src/engine/resolve'
import { parseIntent, DEMO_QUERY } from '../../src/engine/intent'
import { rank } from '../../src/engine/rank'

const now = Date.parse('2026-11-15T10:42:00+05:30')
const recs = generateRecords(20261115, now)
console.log('records', recs.length)
for (const r of recs.slice(0, 14)) console.log(' ', r.supplier.padEnd(9), '|', r.title, '|', r.description.slice(0, 90), '|', r.cancellation, '|', r.priceText)
const parsed = recs.map(parseRecord)
// attribute accuracy vs truth
import { CATALOG } from '../../src/data/sg/catalog'
const vt = new Map(CATALOG.flatMap((e) => e.variants.map((v) => [v.id, v])))
let tOk = 0, tKnown = 0, mOk = 0, aOk = 0, actOk = 0, cOk = 0, cKnown = 0
for (const p of parsed) {
  const v = vt.get(p.record.truth.variant)!
  const tv = p.inclusions.transfer.value
  if (tv !== null) { tKnown++; if (tv === v.transfer) tOk++; else console.log('  transfer miss', p.record.supplier, tv, '!=', v.transfer, '|', p.record.title, '|', p.record.description) }
  if (p.inclusions.meals.value === v.meals) mOk++; else console.log('  meals miss', p.inclusions.meals.value, v.meals, p.record.title)
  if (p.inclusions.access.value === v.access) aOk++
  if ([...(p.inclusions.activities.value ?? [])].sort().join() === [...v.activities].sort().join()) actOk++; else console.log('  act miss', p.inclusions.activities.value, v.activities, '|', p.record.title)
  if (p.cancelH.value !== null) { cKnown++; if (p.cancelH.value === p.record.truth.cancelH) cOk++ }
}
const N = parsed.length
console.log({ transferCoverage: tKnown / N, transferAcc: tOk / tKnown, meals: mOk / N, access: aOk / N, activities: actOk / N, cancelCov: cKnown / N, cancelAcc: cOk / cKnown })
const res = resolve(parsed)
console.log('entities', res.entities.length, 'pairs', res.candidatePairs, '/', res.totalPairs, 'ms', res.ms.toFixed(1))
const dec = res.pairs.reduce((m, p) => (m[p.decision] = (m[p.decision] ?? 0) + 1, m), {} as Record<string, number>)
console.log(dec)
// entity purity
let tp = 0, fp = 0, fn = 0
const recById = new Map(recs.map((r) => [r.id, r]))
const ids = recs.map((r) => r.id)
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
  const same = recById.get(ids[i])!.truth.entity === recById.get(ids[j])!.truth.entity
  const pred = res.entityOf.get(ids[i]) === res.entityOf.get(ids[j])
  if (same && pred) tp++; else if (!same && pred) fp++; else if (same && !pred) fn++
}
console.log('entity pairwise P', (tp / (tp + fp)).toFixed(3), 'R', (tp / (tp + fn)).toFixed(3))
let vtp = 0, vfp = 0, vfn = 0
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
  const a = recById.get(ids[i])!, b = recById.get(ids[j])!
  if (a.truth.entity !== b.truth.entity) continue
  const same = a.truth.variant === b.truth.variant
  const pred = res.variantOf.get(ids[i]) === res.variantOf.get(ids[j])
  if (same && pred) vtp++; else if (!same && pred) vfp++; else if (same && !pred) vfn++
}
console.log('variant pairwise P', (vtp / (vtp + vfp)).toFixed(3), 'R', (vtp / (vtp + vfn)).toFixed(3))
for (const e of res.entities) console.log(' E', e.name.padEnd(30), e.cluster.padEnd(10), 'recs', e.records, 'variants', e.variants.length, 'walk', e.walking, 'fam', e.family, e.variants.map((v) => v.name + `(${v.offers.length})`).join(' ; '))
const intent = parseIntent(DEMO_QUERY)
console.log('intent', intent.hard.map((h) => h.label), intent.soft.map((s) => s.label), intent.missing)
const rk = rank(res.entities, intent, 'match', now)
console.log('funnel', rk.funnel, rk.counts, 'ms', rk.ms.toFixed(1))
for (const r of rk.topPerEntity.slice(0, 8)) console.log(' R', r.status, r.score.toFixed(1), r.entity.name, '|', r.variant.name, '|', r.best?.offer.supplier, r.best?.offer.priceINR, '|', r.reasons.map((x) => x.kind[0] + ':' + x.text).join('; '))
