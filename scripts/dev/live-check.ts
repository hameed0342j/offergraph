// Local check of /api/live + the live ranker against real Viator data.
// Run: npx tsx --env-file=.env --env-file=.env.local scripts/dev/live-check.ts
import { GET as live } from '../../api/live'
import { rankLive } from '../../src/engine/liveRank'
import { applyAnswers, rulesIntent } from '../../src/engine/travelIntent'
import type { LiveResult } from '../../src/lib/live'

const call = async (qs: string) => {
  const t0 = Date.now()
  const r = await live(new Request(`http://local/api/live?${qs}`, { headers: { 'x-forwarded-for': '127.0.0.1' } }))
  const j = (await r.json()) as LiveResult
  return { status: r.status, ms: Date.now() - t0, j }
}

for (const qs of ['dest=goa', 'dest=goa', 'dest=delhi&fc=1&budget=3000', 'dest=kerala', 'dest=kochi', 'dest=atlantis']) {
  const { status, ms, j } = await call(qs)
  console.log(`${qs.padEnd(30)} ${status} ${ms}ms dest=${j.destination ? `${j.destination.name}/${j.destination.type}/${j.destination.country}` : 'none'} total=${j.total ?? '-'} products=${j.products?.length ?? 0} cached=${j.cached ?? '-'}`)
}

const t = applyAnswers(rulesIntent('family day out in goa, 2 adults 2 kids, little walking, hotel pickup, free cancellation'), {})
console.log('\nintent', t.destination, JSON.stringify(t.party), JSON.stringify(t.must), JSON.stringify(t.prefer))
const { j } = await call('dest=goa&fc=1')
const out = rankLive(j.products ?? [], t)
console.log(`ranked ${out.ranked.length}, excluded ${out.excluded.length}`)
for (const x of out.ranked.slice(0, 6))
  console.log(`  ${x.score.toFixed(2)} ₹${Math.round(x.p.priceINR ?? 0)} ★${x.p.rating} (${x.p.reviews}) ${x.p.title.slice(0, 60)} | ${x.checks.map((c) => `${c.label}:${c.state}`).join(', ')} | prefs ${x.prefs.join('/')}`)
