// Rank live supplier products against a trip request: hard requirements pass, fail or stay unknown (with the
// evidence or the reason), preferences only reorder, and nothing is guessed as a pass.
import type { LiveProduct } from '../lib/live'
import type { TravelIntent } from './travelIntent'

export type CheckState = 'pass' | 'fail' | 'unknown'
export interface LiveCheck {
  label: string
  state: CheckState
  why: string
}
export interface LiveRanked {
  p: LiveProduct
  checks: LiveCheck[]
  prefs: string[]
  score: number
  eligible: boolean
  multiDay: boolean
}

const text = (p: LiveProduct) => `${p.title} ${p.summary}`
const flag = (p: LiveProduct, f: string) => p.flags.includes(f)
const first = (re: RegExp, s: string) => re.exec(s)?.[0] ?? null
/** share of the requested checks the listing states as a pass */
const statedShare = (checks: LiveCheck[]) => (checks.length ? checks.filter((c) => c.state === 'pass').length / checks.length : 0)

const PREFS: { key: keyof TravelIntent['prefer']; label: string; good: RegExp; bad?: RegExp }[] = [
  { key: 'lowWalking', label: 'Little walking', good: /\b(by car|ac vehicle|private car|chauffeur|drive|jeep|cruise|boat|tuk[- ]?tuk|rickshaw|cable car)\b/i, bad: /\b(walking tour|trek|trekking|hike|hiking|cycling|bike tour|on foot)\b/i },
  { key: 'relaxing', label: 'Relaxing pace', good: /\b(relax|leisure|spa|sunset|cruise|beach|unwind)\w*/i },
  { key: 'evening', label: 'Evening', good: /\b(evening|night|sunset|dinner)\b/i },
  { key: 'wildlife', label: 'Wildlife', good: /\b(wildlife|safari|bird\w*|dolphins?|elephants?|tigers?|crocodiles?|jungle)\b/i },
  { key: 'views', label: 'Views', good: /\b(views?|sunset|panoram\w*|viewpoint|fort|hilltop)\b/i },
  { key: 'water', label: 'On the water', good: /\b(boat|cruise|river|backwaters?|island|kayak\w*|snorkel\w*|scuba)\b/i },
]

export function rankLive(products: LiveProduct[], t: TravelIntent): { ranked: LiveRanked[]; excluded: LiveRanked[] } {
  const multiDayTrip = !!(t.dates.start && t.dates.end && t.dates.end > t.dates.start)
  const prices = products.map((p) => p.priceINR).filter((x): x is number => x !== null).sort((a, b) => a - b)
  const median = prices[Math.floor(prices.length / 2)] ?? 1
  const asked = PREFS.filter((x) => t.prefer[x.key])

  const all = products.map((p): LiveRanked => {
    const s = text(p)
    const checks: LiveCheck[] = []
    if (t.must.freeCancellation)
      checks.push(flag(p, 'FREE_CANCELLATION') ? { label: 'Free cancellation', state: 'pass', why: 'Viator flag' } : { label: 'Free cancellation', state: 'fail', why: 'Not free to cancel' })
    if (t.must.privateTransfer)
      checks.push(flag(p, 'PRIVATE_TOUR') ? { label: 'Private', state: 'pass', why: 'Viator flag: private tour' } : { label: 'Private', state: 'fail', why: 'Shared tour' })
    else if (t.must.transfer) {
      const pt = p.detail?.pickupType
      checks.push(
        pt === 'everyone'
          ? { label: 'Hotel pickup', state: 'pass', why: 'Viator: pickup offered to every traveller' }
          : pt === 'optional'
            ? { label: 'Hotel pickup', state: 'pass', why: 'Viator: pickup offered, or meet at the start point' }
            : pt === 'meet'
              ? { label: 'Hotel pickup', state: 'fail', why: 'Meet at the start point, no pickup' }
              : p.pickup
                ? { label: 'Hotel pickup', state: 'pass', why: `Says "${p.pickup}"` }
                : { label: 'Hotel pickup', state: 'unknown', why: 'Pickup not stated in the listing' },
      )
    }
    if (t.must.skipTheLine)
      checks.push(flag(p, 'SKIP_THE_LINE') ? { label: 'Skip the line', state: 'pass', why: 'Viator flag' } : { label: 'Skip the line', state: 'fail', why: 'No skip-the-line entry' })
    if (t.budgetPerPersonINR && p.priceINR !== null)
      checks.push(p.priceINR <= t.budgetPerPersonINR ? { label: 'In budget', state: 'pass', why: `From ₹${Math.round(p.priceINR).toLocaleString('en-IN')} per person` } : { label: 'In budget', state: 'fail', why: 'Over the per-person budget' })
    if (t.must.family) {
      const ev = first(/\b(family|families|kids?|children|child-friendly)\b/i, s)
      const adult = first(/\b(beer|pub crawl|bar crawl|nightlife|wine tasting|alcohol|adults? only|18\+)\b/i, p.title)
      checks.push(
        adult
          ? { label: 'Family', state: 'fail', why: `Adults-oriented ("${adult}")` }
          : p.detail?.stroller
          ? { label: 'Family', state: 'pass', why: 'Viator: stroller accessible' }
          : ev
            ? { label: 'Family', state: 'pass', why: `Mentions "${ev}"` }
            : { label: 'Family', state: 'unknown', why: 'Not stated for children' },
      )
    }
    if (t.must.meal) {
      const ev = p.detail?.meals[0] ?? first(/\b(lunch|dinner|breakfast|meals?)\b/i, s)
      checks.push(ev ? { label: 'Meal', state: 'pass', why: p.detail?.meals.length ? `Viator: ${ev} included` : `Mentions "${ev}"` } : { label: 'Meal', state: 'unknown', why: 'No meal stated' })
    }

    const prefs: string[] = []
    let fit = 0
    for (const x of asked) {
      // the supplier's own fitness rating beats wording in the title
      if (x.key === 'lowWalking' && p.detail?.fitness) {
        if (p.detail.fitness === 'easy') {
          fit += 1
          prefs.push('Easy fitness level')
        } else if (p.detail.fitness === 'hard') fit -= 0.5
        continue
      }
      if (x.bad?.test(s)) fit -= 0.5
      else if (x.good.test(s)) {
        fit += 0.6 // wording in the title is weaker evidence than the supplier's own fields
        prefs.push(x.label)
      }
    }
    const fitScore = asked.length ? Math.max(0, fit / asked.length) : 0
    const r = p.rating ?? 4
    const bayes = (r * p.reviews + 4.4 * 15) / (p.reviews + 15)
    const quality = Math.min(1, Math.max(0, (bayes - 3.5) / 1.5)) * 0.8 + Math.min(1, Math.log10(p.reviews + 1) / 3) * 0.2
    const value = p.priceINR ? median / (p.priceINR + median) : 0.4
    const multiDay = (p.minutes ?? 0) >= 1440
    // a point-to-point transfer is not a thing to do, even when it is the best-rated listing
    const transferOnly = /\b(airport|railway station)\b.*\btransfer\b|\btransfer\b.*\b(airport|hotel)\b/i.test(p.title)
    // listings that state what was asked for beat listings that are silent about it
    const stated = statedShare(checks)
    const score =
      (asked.length ? 0.4 * fitScore + 0.4 * quality : 0.75 * quality) + 0.2 * value + 0.3 * stated - (multiDay && !multiDayTrip ? 1 : 0) - (transferOnly ? 0.4 : 0)
    return { p, checks, prefs, score, eligible: !checks.some((c) => c.state === 'fail'), multiDay }
  })

  return {
    ranked: all.filter((x) => x.eligible).sort((a, b) => b.score - a.score),
    excluded: all.filter((x) => !x.eligible).sort((a, b) => b.score - a.score),
  }
}

export function fmtDuration(min: number | null, max: number | null) {
  if (min === null) return null
  const f = (m: number) => (m >= 1440 ? `${Math.round(m / 1440)} day${m >= 2880 ? 's' : ''}` : m >= 60 ? `${+(m / 60).toFixed(1)} h` : `${m} min`)
  return max && max !== min ? `${f(min)} to ${f(max)}` : f(min)
}
