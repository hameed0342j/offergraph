import { generateRecords } from '../../src/data/sg/generate'
import { parseRecord } from '../../src/engine/parse'
import { resolve } from '../../src/engine/resolve'
import { parseIntent } from '../../src/engine/intent'
import { rank } from '../../src/engine/rank'
const now = Date.now()
const res = resolve(generateRecords(20261115, now).map(parseRecord))
for (const q of [
  'Private transfer to see animals in Singapore with dinner',
  'Cheap things to do in Singapore under 2500',
  'Singapore night activity for my parents, not much walking, free cancellation',
  'theme park with express pass',
  '',
  'Find a family boat trip in Singapore with hotel pickup',
]) {
  const it = parseIntent(q)
  for (const m of ['match', 'value', 'flexible'] as const) {
    const r = rank(res.entities, it, m, now)
    if (m === 'match') console.log(JSON.stringify(q), '| hard:', it.hard.map((h) => h.label).join(', ') || '-', '| soft:', it.soft.map((s) => s.label).join(', ') || '-', '| eligible', r.counts.eligibleVariants)
    console.log('   ', m.padEnd(8), r.topPerEntity.slice(0, 3).map((x) => `${x.entity.name} (${x.variant.name}, ${x.status}, ${Math.round(x.score)})`).join(' | '))
  }
}
