// One trip request model shared by the browser and the /api/intent function.
// The LLM (Claude) fills it when a key is configured; the rule parser fills it otherwise.
import { parseIntent, type Constraint, type HardKey, type Intent, type SoftKey } from './intent'

export type Category = 'sightseeing' | 'hotel' | 'both'
export type FieldId = 'destination' | 'category' | 'party' | 'dates' | 'budget' | 'mustHaves'

export interface Question {
  id: FieldId
  question: string
  options: string[]
  multi: boolean
  optional: boolean
}

export interface TravelIntent {
  text: string
  source: 'claude' | 'gemini' | 'rules'
  destination: string | null
  category: Category | null
  party: { adults: number | null; children: number | null }
  dates: { start: string | null; end: string | null; label: string | null }
  budgetPerPersonINR: number | null
  must: { transfer: boolean; privateTransfer: boolean; freeCancellation: boolean; meal: boolean; skipTheLine: boolean; family: boolean }
  prefer: { lowWalking: boolean; relaxing: boolean; evening: boolean; wildlife: boolean; views: boolean; water: boolean }
  questions: Question[]
}

/** The multi-supplier demo graph (synthetic offers from 8 suppliers). Every other destination goes to the
 *  live page, which searches real supplier inventory (Viator) and says so when no supplier covers it. */
export const LIVE_DESTINATIONS = ['singapore']
export const PLANNED_DESTINATIONS = ['dubai', 'bangkok', 'phuket', 'maldives', 'bali', 'colombo', 'kathmandu', 'delhi']
export const INDIA_DESTINATIONS = [
  'new delhi', 'delhi', 'mumbai', 'goa', 'jaipur', 'agra', 'udaipur', 'jodhpur', 'jaisalmer', 'varanasi', 'rishikesh', 'haridwar',
  'kerala', 'kochi', 'cochin', 'munnar', 'alleppey', 'trivandrum', 'kolkata', 'chennai', 'bangalore', 'bengaluru', 'mysore', 'hyderabad',
  'amritsar', 'manali', 'shimla', 'leh', 'ladakh', 'srinagar', 'kashmir', 'darjeeling', 'pondicherry', 'andaman', 'ooty', 'hampi',
  'khajuraho', 'aurangabad', 'pune', 'ahmedabad', 'lucknow', 'mangalore', 'dharamsala', 'gangtok', 'india',
]

export const REQUIRED: FieldId[] = ['destination', 'category', 'party', 'dates']

export function isLive(t: TravelIntent) {
  return !!t.destination && LIVE_DESTINATIONS.includes(t.destination.toLowerCase())
}

export function missingFields(t: TravelIntent): FieldId[] {
  const m: FieldId[] = []
  if (!t.destination) m.push('destination')
  if (!t.category) m.push('category')
  if (t.party.adults === null) m.push('party')
  if (!t.dates.start && !t.dates.label) m.push('dates')
  return m
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
// most specific first ("new delhi" before "delhi", cities before "india")
const CITY_WORDS = ['singapore', ...INDIA_DESTINATIONS, ...PLANNED_DESTINATIONS, 'paris', 'london', 'tokyo', 'istanbul', 'abu dhabi', 'doha']

function iso(d: Date) {
  return d.toISOString().slice(0, 10)
}

/** Rule-based parse: used offline and as the fallback when the LLM is unavailable. */
export function rulesIntent(text: string, today = new Date()): TravelIntent {
  const base = parseIntent(text)
  const q = ' ' + text.toLowerCase() + ' '
  const has = (k: HardKey) => base.hard.some((h) => h.key === k)
  const soft = (k: SoftKey) => base.soft.some((s) => s.key === k)

  const destination = CITY_WORDS.find((c) => new RegExp(`\\b${c}\\b`).test(q)) ?? null
  const hotelWords = /\b(hotel|stay|room|resort|nights?|accommodation|check[- ]?in)\b/.test(q)
  const doWords = /\b(things to do|sightseeing|tours?|activit(y|ies)|experiences?|attractions?|day out|tickets?|safari|cruise|park)\b/.test(q)
  const category: Category | null = hotelWords && doWords ? 'both' : hotelWords ? 'hotel' : doWords ? 'sightseeing' : null

  const a = /(\d+)\s*(adults?|grown-?ups?|people|persons|pax)/.exec(q)
  const c = /(\d+)\s*(kids?|children|child|toddlers?)/.exec(q)
  let adults: number | null = a ? parseInt(a[1], 10) : null
  let children: number | null = c ? parseInt(c[1], 10) : null
  if (adults === null && /\b(couple|my (wife|husband|partner)|honeymoon)\b/.test(q)) adults = 2
  if (adults === null && /\b(solo|alone|just me|myself)\b/.test(q)) adults = 1
  if (children === null && adults !== null && !/\b(kids?|children|child|family)\b/.test(q)) children = 0

  let start: string | null = null
  let label: string | null = null
  const dm = new RegExp(`\\b(\\d{1,2})(st|nd|rd|th)?\\s*(${MONTHS.join('|')})[a-z]*\\b`).exec(q)
  if (dm) {
    const d = new Date(today.getFullYear(), MONTHS.indexOf(dm[3]), parseInt(dm[1], 10))
    if (d < today) d.setFullYear(d.getFullYear() + 1)
    start = iso(d)
    label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  } else if (/\btomorrow\b/.test(q)) {
    const d = new Date(today.getTime() + 86400000)
    start = iso(d)
    label = 'Tomorrow'
  } else if (/\b(this|next) weekend\b/.test(q)) {
    const d = new Date(today)
    d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7) + (/next weekend/.test(q) ? 7 : 0))
    start = iso(d)
    label = /next weekend/.test(q) ? 'Next weekend' : 'This weekend'
  }

  const budget = base.hard.find((h) => h.key === 'maxPrice')
  return {
    text,
    source: 'rules',
    destination: destination ? destination.replace(/\b\w/g, (x) => x.toUpperCase()) : null,
    category,
    party: { adults, children },
    dates: { start, end: null, label },
    budgetPerPersonINR: budget ? Number(budget.value) : null,
    must: {
      transfer: has('transfer'),
      privateTransfer: has('privateTransfer'),
      freeCancellation: has('freeCancel'),
      meal: has('meal'),
      skipTheLine: has('fastTrack'),
      family: has('family') || (children ?? 0) > 0,
    },
    prefer: { lowWalking: soft('lowWalking'), relaxing: soft('relaxing'), evening: soft('evening'), wildlife: soft('wildlife'), views: soft('views'), water: soft('water') },
    questions: [],
  }
}

/** Follow-up questions for the missing details (the LLM writes its own when available). */
export function defaultQuestions(t: TravelIntent): Question[] {
  const out: Question[] = []
  for (const f of missingFields(t)) {
    if (f === 'destination') out.push({ id: f, question: 'Where are you headed?', options: ['Goa', 'Jaipur', 'Kerala', 'Singapore'], multi: false, optional: false })
    if (f === 'category') out.push({ id: f, question: 'What should I find for you?', options: ['Things to do', 'A hotel', 'Both'], multi: false, optional: false })
    if (f === 'party') out.push({ id: f, question: 'Who is travelling?', options: ['Just me', 'Couple', 'Family, 2 adults 2 kids', 'Group of 4 adults'], multi: false, optional: false })
    if (f === 'dates') out.push({ id: f, question: 'When is the trip?', options: ['This weekend', 'Next weekend', 'In a month', 'Not decided'], multi: false, optional: false })
  }
  if (t.budgetPerPersonINR === null) out.push({ id: 'budget', question: 'Budget per person?', options: ['Under ₹3,000', '₹3,000 to ₹6,000', 'No limit'], multi: false, optional: true })
  if (!Object.values(t.must).some(Boolean) && !t.prefer.lowWalking)
    out.push({ id: 'mustHaves', question: 'Anything that must be included?', options: ['Hotel transfer', 'Free cancellation', 'Little walking', 'Meal included', 'Skip the line'], multi: true, optional: true })
  return out.slice(0, 6)
}

/** Fold the answers from the follow-up dialog back into the intent. */
export function applyAnswers(t: TravelIntent, answers: Partial<Record<FieldId, string | string[]>>, today = new Date()): TravelIntent {
  const n: TravelIntent = structuredClone(t)
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
  if (answers.destination) n.destination = one(answers.destination).trim().replace(/\b\w/g, (x) => x.toUpperCase())
  if (answers.category) {
    const v = one(answers.category).toLowerCase()
    n.category = /both/.test(v) ? 'both' : /hotel|stay/.test(v) ? 'hotel' : 'sightseeing'
  }
  if (answers.party) {
    const v = one(answers.party).toLowerCase()
    const a = /(\d+)\s*adult/.exec(v)
    const c = /(\d+)\s*(kid|child)/.exec(v)
    if (a || c) {
      n.party = { adults: a ? +a[1] : 2, children: c ? +c[1] : 0 }
    } else if (/just me|solo/.test(v)) n.party = { adults: 1, children: 0 }
    else if (/couple/.test(v)) n.party = { adults: 2, children: 0 }
    else if (/family/.test(v)) n.party = { adults: 2, children: 2 }
    else if (/group/.test(v)) n.party = { adults: 4, children: 0 }
    else n.party = { adults: 2, children: 0 }
    if ((n.party.children ?? 0) > 0) n.must.family = true
  }
  if (answers.dates) {
    const v = one(answers.dates)
    const d = new Date(today)
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      n.dates = { start: v, end: null, label: new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }
    } else {
      if (/this weekend/i.test(v)) d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7))
      else if (/next weekend/i.test(v)) d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7) + 7)
      else if (/month/i.test(v)) d.setDate(d.getDate() + 30)
      n.dates = { start: /not decided/i.test(v) ? null : iso(d), end: null, label: v }
    }
  }
  if (answers.budget) {
    const v = one(answers.budget)
    const m = /under\s*₹?([\d,]+)/i.exec(v) ?? /to\s*₹?([\d,]+)/i.exec(v)
    n.budgetPerPersonINR = m ? parseInt(m[1].replace(/,/g, ''), 10) : null
  }
  if (answers.mustHaves) {
    const v = (Array.isArray(answers.mustHaves) ? answers.mustHaves : [answers.mustHaves]).join(' ').toLowerCase()
    if (/transfer/.test(v)) n.must.transfer = true
    if (/cancel/.test(v)) n.must.freeCancellation = true
    if (/walking/.test(v)) n.prefer.lowWalking = true
    if (/meal/.test(v)) n.must.meal = true
    if (/skip|line/.test(v)) n.must.skipTheLine = true
  }
  n.questions = []
  return n
}

/** Build the ranking intent (hard constraints filter, preferences only rank) from a trip intent. */
export function toRankIntent(t: TravelIntent): Intent {
  const hard: Constraint<HardKey>[] = []
  const soft: Constraint<SoftKey>[] = []
  if (t.destination) hard.push({ key: 'destination', label: `In ${t.destination}`, evidence: t.destination })
  if (t.must.family) hard.push({ key: 'family', label: 'Family suitable', evidence: 'family' })
  if (t.must.privateTransfer) hard.push({ key: 'privateTransfer', label: 'Private transfer', evidence: 'private' })
  else if (t.must.transfer) hard.push({ key: 'transfer', label: 'Transport included', evidence: 'transport' })
  if (t.must.freeCancellation) hard.push({ key: 'freeCancel', label: 'Free cancellation 24h+', evidence: 'cancellation', value: 24 })
  if (t.budgetPerPersonINR) hard.push({ key: 'maxPrice', label: `Under ₹${t.budgetPerPersonINR.toLocaleString('en-IN')} per person`, evidence: 'budget', value: t.budgetPerPersonINR })
  if (t.must.meal) hard.push({ key: 'meal', label: 'Meal included', evidence: 'meal' })
  if (t.must.skipTheLine) hard.push({ key: 'fastTrack', label: 'Skip the line', evidence: 'skip the line' })
  const S: [keyof TravelIntent['prefer'], SoftKey, string][] = [
    ['lowWalking', 'lowWalking', 'Low walking'],
    ['relaxing', 'relaxing', 'Relaxing pace'],
    ['evening', 'evening', 'Evening'],
    ['wildlife', 'wildlife', 'Wildlife'],
    ['views', 'views', 'Views'],
    ['water', 'water', 'On the water'],
  ]
  for (const [k, key, label] of S) if (t.prefer[k]) soft.push({ key, label, evidence: label.toLowerCase() })
  const party = t.party.adults !== null ? { adults: t.party.adults, children: t.party.children ?? 0 } : null
  return { text: t.text, destination: t.destination?.toLowerCase() ?? null, party, hard, soft, missing: missingFields(t), ms: 0 }
}

/** Short chips that say what the results were personalised for. */
export function personalChips(t: TravelIntent): string[] {
  const c: string[] = []
  if (t.party.adults !== null) c.push(`${t.party.adults} adult${t.party.adults > 1 ? 's' : ''}${t.party.children ? `, ${t.party.children} kid${t.party.children > 1 ? 's' : ''}` : ''}`)
  if (t.dates.label) c.push(t.dates.label)
  if (t.budgetPerPersonINR) c.push(`under ₹${t.budgetPerPersonINR.toLocaleString('en-IN')}`)
  if (t.prefer.lowWalking) c.push('little walking')
  if (t.must.transfer || t.must.privateTransfer) c.push('with transfer')
  if (t.must.freeCancellation) c.push('free cancellation')
  return c
}
