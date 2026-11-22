import { resolveHotels } from '../../src/engine/hotels'
const r = resolveHotels()
console.log('records', r.records.length, 'properties', r.properties.length, 'rawRooms', r.rawRooms, 'ms', r.ms.toFixed(1))
console.log('eval', r.eval)
const dec = r.pairs.reduce((m, p) => (m[p.decision] = (m[p.decision] ?? 0) + 1, m), {} as Record<string, number>)
console.log(dec)
for (const p of r.review) console.log(' review', p.a, p.b, p.score.toFixed(2), p.reason)
for (const p of r.properties) console.log(' P', p.name.padEnd(36), p.records.length, 'recs', p.rooms.length, 'rooms from', p.from, '| conf', p.confidence.toFixed(2), '| img', p.image.supplier, p.image.why)
const pp = r.properties[0]
for (const g of pp.rooms.slice(0, 5)) console.log('   room', g.label, g.key.board, g.key.refundable ? 'refundable' : 'NRF', g.offers.length, 'offers best', g.best.supplier, g.best.priceINR, '|', g.offers.map((o) => o.rec.raw).slice(0, 3).join(' || '))
