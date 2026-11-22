import { FX } from '../data/sg/generate'
import { tokens } from './text'
import type { Access, Evidence, Guide, Meals, Parsed, ParsedOffer, RawRecord, Transfer, Walking } from './types'

// Supplier record -> structured attributes with provenance. Rules are negation-aware:
// "optional transfer at extra cost" or "dinner not included" must not count as included.

interface Clause {
  field: Evidence['field']
  text: string
  negated: boolean
}

const NEG = /\b(not included|not incl|excluded|excludes|at extra cost|extra charge|for a fee|can be added|optional|available on request|not recommended)\b/

function clauses(r: RawRecord): Clause[] {
  const out: Clause[] = []
  const add = (field: Evidence['field'], s: string) => {
    for (const part of s.split(/[.;|]|,(?![^(]*\))/)) {
      const text = part.trim()
      if (!text) continue
      const low = text.toLowerCase()
      out.push({ field, text, negated: NEG.test(low) || /\bno (hotel |transfer|pick)/.test(low) })
    }
  }
  add('title', r.title)
  add('description', r.description)
  return out
}

function find(cs: Clause[], re: RegExp, allowNegated = false): Clause | null {
  for (const c of cs) if ((allowNegated || !c.negated) && re.test(c.text.toLowerCase())) return c
  return null
}

const ev = (c: Clause | null): Evidence | null => (c ? { field: c.field, text: c.text } : null)
const P = <T,>(value: T | null, c: Clause | null): Parsed<T> => ({ value, evidence: ev(c) })

const RE = {
  private: /\b(pvt|private)\b(?! guide)|private (car|transfer|pick ?up|chauffeur)|chauffeur/,
  shared: /\b(sic|seat-in-coach|shuttle|shared transfer|return transfers?|round-trip (hotel )?transfers?|hotel pick-?up|pickup|pick-up|rt sic|trf|transfers?)\b/,
  noneTicket: /\b(ticket only|adm only|admission only|admission ticket|e-ticket|entry ticket)\b|^ticket$/,
  ticketWord: /\b(ticket|admission|adm|entry)\b/,
  transferWord: /\b(transfers?|trf|pick-?up|pickup|shuttle|chauffeur)\b/,
  fine: /sky dining|4-course|fine dining/,
  meal: /\b(buffet dinner|dinner|breakfast|lunch|meal included|meal)\b/,
  snack: /\b(tastings?|snacks?)\b/,
  fast: /\b(express( pass)?|skip-the-line|fast ?track|priority)\b/,
  vip: /\b(vip|premium seat(ing)?)\b/,
  guidePrivate: /\b(private guide|pvt guide|private guided)\b/,
  guideGroup: /\b(small-group guided|guided|live guide)\b/,
  guideAudio: /\baudio guide\b/,
}

const ACTIVITY_RES: [string, RegExp][] = [
  ['tram', /\btram\b/],
  ['boat ride', /\b(boat ride|river boat|bumboat cruise|river cruise|cruise)\b/],
  ['skyway', /\bskyway\b/],
  ['two domes', /\b(flower dome|2 domes|two domes|cloud forest)\b/],
  ['snow city', /\bsnow city\b/],
  ['luge x3', /\b(3 luge|3x luge|three rides)\b/],
  ['skyride', /\bskyride\b/],
  ['canopy bridge', /\bcanopy bridge\b/],
  ['hedge maze', /\b(hedge maze|mazes)\b/],
  ['bike', /\b(bicycle|bike)\b/],
  ['bumboat', /\bbumboat crossing\b/],
  ['farm visit', /\bfarm (visits?|tour)\b/],
  ['ferry', /\bferry\b/],
]

export function parseTransfer(cs: Clause[]): Parsed<Transfer> {
  const pvt = find(cs, RE.private)
  if (pvt) return P<Transfer>('private', pvt)
  const shared = find(cs, RE.shared)
  if (shared) return P<Transfer>('shared', shared)
  // explicit "not included" statements about transfers
  const negT = cs.find((c) => c.negated && RE.transferWord.test(c.text.toLowerCase()))
  if (negT) return P<Transfer>('none', negT)
  const atlas = find(cs, /transfer: not included/, true)
  if (atlas) return P<Transfer>('none', atlas)
  const ticket = find(cs, RE.noneTicket)
  if (ticket) return P<Transfer>('none', ticket)
  // a title that sells a ticket and never mentions transport: ticket only (weaker evidence)
  const title = cs.find((c) => c.field === 'title' && RE.ticketWord.test(c.text.toLowerCase()))
  if (title) return P<Transfer>('none', title)
  return P<Transfer>(null, null)
}

function parseMeals(cs: Clause[]): Parsed<Meals> {
  const fine = find(cs, RE.fine)
  if (fine) return P<Meals>('fine', fine)
  const meal = find(cs, RE.meal)
  if (meal) return P<Meals>('meal', meal)
  const snack = find(cs, RE.snack)
  if (snack) return P<Meals>('snack', snack)
  const neg = cs.find((c) => c.negated && /\b(dinner|meals?|lunch|breakfast)\b/.test(c.text.toLowerCase()))
  return P<Meals>('none', neg ?? null)
}

function parseAccess(cs: Clause[]): Parsed<Access> {
  const f = find(cs, RE.fast)
  if (f) return P<Access>('fast-track', f)
  const vip = find(cs, RE.vip)
  if (vip) return P<Access>('vip', vip)
  return P<Access>('standard', null)
}

function parseGuide(cs: Clause[]): Parsed<Guide> {
  const p = find(cs, RE.guidePrivate)
  if (p) return P<Guide>('private', p)
  const g = find(cs, RE.guideGroup)
  if (g) return P<Guide>('group', g)
  const a = find(cs, RE.guideAudio)
  if (a) return P<Guide>('audio', a)
  return P<Guide>('self', null)
}

function parseActivities(cs: Clause[]): Parsed<string[]> {
  const out: string[] = []
  let first: Clause | null = null
  for (const [name, re] of ACTIVITY_RES) {
    const c = find(cs, re)
    if (c) {
      out.push(name)
      first = first ?? c
    }
  }
  return { value: out, evidence: ev(first) }
}

export function parseDuration(text: string | null): Parsed<number> {
  if (!text) return { value: null, evidence: null }
  const m = /(\d+(?:\.\d+)?)\s*(h|hrs?|hours?)\b/i.exec(text)
  return m ? { value: parseFloat(m[1]), evidence: { field: 'duration', text } } : { value: null, evidence: null }
}

export function parseCancellation(text: string): Parsed<number> {
  const t = text.toLowerCase()
  if (!t.trim()) return { value: null, evidence: null }
  const e: Evidence = { field: 'cancellation', text }
  let m = /(free (cancellation|cxl)|fully refundable|full refund)[^0-9]*(\d+)\s*(hours|hrs|h)\b/.exec(t)
  if (m) return { value: parseInt(m[3], 10), evidence: e }
  m = /cancel (\d+)\s*(hours|hrs|h)\b[^.]*full refund/.exec(t)
  if (m) return { value: parseInt(m[1], 10), evidence: e }
  if (/non.?refundable|no refund/.test(t)) return { value: 0, evidence: e }
  return { value: null, evidence: e } // vague ("per supplier policy")
}

function parseWalking(cs: Clause[]): Parsed<Walking> {
  const low = find(cs, /minimal walking|very little walking|seated experience|all fitness levels/)
  if (low) return P<Walking>('low', low)
  const high = find(cs, /\d+ to \d+ km of walking|lots of walking|good level of fitness/)
  if (high) return P<Walking>('high', high)
  const mod = find(cs, /moderate walking|some walking/)
  if (mod) return P<Walking>('moderate', mod)
  return P<Walking>(null, null)
}

function parseFamily(cs: Clause[]): Parsed<boolean> {
  const no = find(cs, /not recommended for children/, true)
  if (no) return P(false, no)
  const yes = find(cs, /suitable for families|children welcome|kids/)
  if (yes) return P(true, yes)
  return P<boolean>(null, null)
}

export function parsePrice(r: RawRecord): number {
  const m = /([\d.]+)/.exec(r.priceText.replace(/,/g, ''))
  const amount = m ? parseFloat(m[1]) : 0
  return Math.round(amount * FX[r.currency])
}

export function parseRecord(r: RawRecord): ParsedOffer {
  const cs = clauses(r)
  return {
    record: r,
    priceINR: parsePrice(r),
    inclusions: {
      transfer: parseTransfer(cs),
      access: parseAccess(cs),
      meals: parseMeals(cs),
      activities: parseActivities(cs),
      durationH: parseDuration(r.durationText),
      guide: parseGuide(cs),
    },
    cancelH: parseCancellation(r.cancellation),
    walking: parseWalking(cs),
    family: parseFamily(cs),
    tokens: tokens(`${r.title} ${r.description}`),
  }
}

/** Words that describe inclusions, not the attraction: stripped to get the core name. */
const INCLUSION_WORDS = new Set(
  tokens(
    'ticket tickets only adm admission entry e-ticket e ticket transfer transfers trf sic pvt private shared seat in coach central hotels hotel hotels pickup pick up drop off round trip return rt shuttle chauffeur car ' +
      'tram ride rides boat buffet dinner meal included lunch breakfast tastings snacks express pass skip line fast track vip premium seating seat ' +
      'guided guide small group live english experience tour with plus approx hours hrs singapore sg day one 3 3x x 2 4 course sky dining ' +
      'skyway skyride snow city canopy bridge hedge maze mazes bicycle bike bumboat crossing farm visits ferry domes',
  ),
)

/** The attraction's core name from a supplier title, e.g. "NIGHT SAFARI ADM ONLY" -> ["night","safari"]. */
export function coreName(title: string): string[] {
  const head = title.split(/[:|(]| - (?=[A-Z(])/).filter((x) => x.trim())
  // Atlas style "Singapore - X (variant)": the attraction sits after the dash
  let text = /^singapore - /i.test(title) ? title.replace(/^singapore - /i, '').split('(')[0] : head[0] ?? title
  // inclusions usually follow "with", "incl", "w/" or "+"
  text = text.split(/\s+(?:with|w\/|incl\.?|including)\s+|\s+\+\s+/i)[0]
  return [...new Set(tokens(text).filter((t) => !INCLUSION_WORDS.has(t)))]
}
