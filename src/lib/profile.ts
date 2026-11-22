import type { FieldId, TravelIntent } from '../engine/travelIntent'

// A small traveller profile kept in this browser only: it pre-selects answers in the
// follow-up dialog and records what the traveller opens, to nudge later rankings.

export interface Profile {
  party?: { adults: number; children: number }
  budgetPerPersonINR?: number | null
  lowWalking?: boolean
  transfer?: boolean
  freeCancellation?: boolean
  interests: Record<string, number> // attraction category -> times opened
  searches: number
}

const KEY = 'offergraph.profile.v1'

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { interests: {}, searches: 0, ...JSON.parse(raw) }
  } catch {
    /* storage blocked: run without a profile */
  }
  return { interests: {}, searches: 0 }
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

export function rememberTrip(t: TravelIntent) {
  const p = loadProfile()
  if (t.party.adults !== null) p.party = { adults: t.party.adults, children: t.party.children ?? 0 }
  if (t.budgetPerPersonINR) p.budgetPerPersonINR = t.budgetPerPersonINR
  p.lowWalking = t.prefer.lowWalking || p.lowWalking
  p.transfer = t.must.transfer || p.transfer
  p.freeCancellation = t.must.freeCancellation || p.freeCancellation
  p.searches = (p.searches ?? 0) + 1
  saveProfile(p)
}

export function rememberInterest(category: string) {
  const p = loadProfile()
  p.interests[category] = (p.interests[category] ?? 0) + 1
  saveProfile(p)
}

/** Answers to pre-select in the follow-up dialog, from the saved profile. */
export function suggestedAnswers(p: Profile): Partial<Record<FieldId, string | string[]>> {
  const out: Partial<Record<FieldId, string | string[]>> = {}
  if (p.party) out.party = p.party.children ? `${p.party.adults} adults ${p.party.children} kids` : p.party.adults === 1 ? 'Just me' : `${p.party.adults} adults`
  const must: string[] = []
  if (p.transfer) must.push('Hotel transfer')
  if (p.freeCancellation) must.push('Free cancellation')
  if (p.lowWalking) must.push('Little walking')
  if (must.length) out.mustHaves = must
  return out
}
