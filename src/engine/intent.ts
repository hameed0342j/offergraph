// Plain-language request -> structured intent. Hard constraints filter; soft preferences only rank.
// Offline this is a rule-based parser; in production an LLM with structured output and the same
// schema, validated against the domain ontology.

export type HardKey = 'destination' | 'family' | 'transfer' | 'privateTransfer' | 'freeCancel' | 'maxPrice' | 'meal' | 'fastTrack'
export type SoftKey = 'lowWalking' | 'relaxing' | 'evening' | 'wildlife' | 'views' | 'water'

export interface Constraint<K extends string> {
  key: K
  label: string
  evidence: string // the words in the request that produced it
  value?: number | string
}

export interface Intent {
  text: string
  destination: string | null
  party: { adults: number; children: number } | null
  hard: Constraint<HardKey>[]
  soft: Constraint<SoftKey>[]
  missing: string[]
  ms: number
}

const DESTS = ['singapore']

function grab(text: string, re: RegExp): string | null {
  const m = re.exec(text)
  return m ? m[0] : null
}

export function parseIntent(text: string): Intent {
  const t0 = performance.now()
  const q = ' ' + text.toLowerCase().replace(/[’']/g, "'") + ' '
  const hard: Constraint<HardKey>[] = []
  const soft: Constraint<SoftKey>[] = []

  const dest = DESTS.find((d) => q.includes(d)) ?? null
  if (dest) hard.push({ key: 'destination', label: 'In Singapore', evidence: dest })

  let party: Intent['party'] = null
  const fam = grab(q, /\b(family|families|kids?|children|child|toddlers?)\b/)
  if (fam) {
    const a = /(\d+)\s*adults?/.exec(q)
    const c = /(\d+)\s*(kids?|children|child)/.exec(q)
    party = { adults: a ? parseInt(a[1], 10) : 2, children: c ? parseInt(c[1], 10) : 2 }
    hard.push({ key: 'family', label: 'Family suitable', evidence: fam })
  }

  const priv = grab(q, /\bprivate (transfer|transport|car|tour)s?\b/)
  const tr = grab(q, /\b(with|incl\w*|includes?|plus)\s+(hotel\s+)?(transport|transfers?|pick-?ups?|pickup)\b|\btransport included\b|\bhotel pick-?up\b/)
  if (priv) hard.push({ key: 'privateTransfer', label: 'Private transfer', evidence: priv })
  else if (tr) hard.push({ key: 'transfer', label: 'Transport included', evidence: tr.trim() })

  const fc = grab(q, /\b(flexible|free)\s+cancell?ation\b|\bfully refundable\b|\brefundable\b|\bcan cancel\b/)
  if (fc) hard.push({ key: 'freeCancel', label: 'Free cancellation 24h+', evidence: fc, value: 24 })

  const budget = /\b(under|below|less than|max(?:imum)?|within)\s*(?:inr|rs\.?|₹)?\s*([\d,]+)\s*(k)?\b/.exec(q)
  if (budget) {
    const v = parseInt(budget[2].replace(/,/g, ''), 10) * (budget[3] ? 1000 : 1)
    if (v >= 300) hard.push({ key: 'maxPrice', label: `Under ₹${v.toLocaleString('en-IN')} per person`, evidence: budget[0].trim(), value: v })
  }

  const meal = grab(q, /\bwith (dinner|lunch|a meal|meals?|breakfast)\b|\bdinner included\b/)
  if (meal) hard.push({ key: 'meal', label: 'Meal included', evidence: meal })

  const fast = grab(q, /\b(express( pass)?|skip[- ]the[- ]line|fast ?track|no queues?)\b/)
  if (fast) hard.push({ key: 'fastTrack', label: 'Skip the line', evidence: fast.trim() })

  const walk = grab(q, /\b(avoid|no|not much|minimal|little|less)\s+(strenuous\s+)?walking\b|\blow walking\b|\bstroller\b|\bwheelchair\b|\belderly\b|\bgrandparents?\b/)
  if (walk) soft.push({ key: 'lowWalking', label: 'Low walking', evidence: walk })

  const rel = grab(q, /\b(relax\w*|calm|easy|laid-?back|slow)\b/)
  if (rel) soft.push({ key: 'relaxing', label: 'Relaxing pace', evidence: rel })

  const eve = grab(q, /\b(evening|night|sunset|after dark)\b/)
  if (eve) soft.push({ key: 'evening', label: 'Evening', evidence: eve })

  const wild = grab(q, /\b(animals?|wildlife|zoo|safari|birds?)\b/)
  if (wild) soft.push({ key: 'wildlife', label: 'Wildlife', evidence: wild })

  const views = grab(q, /\b(views?|skyline|observation|scenic)\b/)
  if (views) soft.push({ key: 'views', label: 'Views', evidence: views })

  const water = grab(q, /\b(boat|cruise|river|island|beach)\b/)
  if (water) soft.push({ key: 'water', label: 'On the water', evidence: water })

  const missing: string[] = []
  if (!/\b(\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(q)) missing.push('Date')
  if (!budget) missing.push('Budget')
  return { text, destination: dest, party, hard, soft, missing, ms: performance.now() - t0 }
}

export const DEMO_QUERY = 'Find a relaxing family sightseeing experience in Singapore, with transport and flexible cancellation. Avoid strenuous walking.'
