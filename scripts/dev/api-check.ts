// Local check of the server functions with the real env (.env + .env.local), no dev server needed.
// Run: npx tsx --env-file=.env --env-file=.env.local scripts/dev/api-check.ts
import { GET as health } from '../../api/health'
import { POST as intent } from '../../api/intent'
import { GET as stats } from '../../api/stats'
import { POST as track } from '../../api/track'

const req = (body: unknown) => new Request('http://local/api', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' }, body: JSON.stringify(body) })

console.log('health', JSON.stringify(await (await health()).json()))

for (const text of ['family trip to singapore next weekend, 2 adults 2 kids, little walking, need hotel transfer', 'something fun in goa', 'something fun in goa']) {
  const t0 = Date.now()
  const r = await intent(req({ text }))
  const j = (await r.json()) as Record<string, unknown>
  console.log(`\nintent ${r.status} ${Date.now() - t0}ms source=${j.source} cached=${!!j.cached} fallback=${j.fallback ?? '-'}`)
  console.log('  ', JSON.stringify({ destination: j.destination, category: j.category, party: j.party, dates: j.dates, must: j.must, prefer: j.prefer }))
  console.log('   questions:', JSON.stringify((j.questions as { id: string; question: string; options: string[] }[] | undefined)?.map((q) => `${q.id}: ${q.question} [${q.options.join(' | ')}]`)))
}

console.log('\ntrack', JSON.stringify(await (await track(req({ destination: 'Singapore', category: 'sightseeing', live: true, provider: 'gemini' }))).json()))
console.log('stats', JSON.stringify(await (await stats()).json()))
