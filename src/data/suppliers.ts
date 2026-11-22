// Supplier names are fictional on purpose: the reliability figures are synthetic and
// must not be read as claims about real companies. Rolling 30-day metrics.

export type MarkKind = 'asterisk' | 'grid' | 'peak' | 'waves' | 'arc' | 'sun' | 'diamond' | 'drop'

export interface Supplier {
  id: string
  name: string
  kind: string
  mark: MarkKind
  tile: string // logo tile background
  ink: string // logo glyph color
  instantConfirm: number // share of bookings confirmed instantly
  failRate: number // booking failures after the agent pressed book
  priceJump: number // pre-book price increase rate
  payment: 'Agent credit 30d' | 'Agent credit 15d' | 'Pay now' | 'Pay at hotel' | 'Pay later 7d'
  contentScore: number // completeness of its content, 0..1
  commission: number // TBO net margin share on this supplier, never shown to agents
}

export const SUPPLIERS: Supplier[] = [
  { id: 'atlas', name: 'Atlas Beds', kind: 'Bedbank, 41k hotels', mark: 'asterisk', tile: '#ffffff', ink: '#0c0d0c', instantConfirm: 0.994, failRate: 0.003, priceJump: 0.006, payment: 'Agent credit 30d', contentScore: 0.86, commission: 0.071 },
  { id: 'meridian', name: 'Meridian Connect', kind: 'Wholesaler, direct contracts', mark: 'grid', tile: '#2f5bff', ink: '#ffffff', instantConfirm: 0.989, failRate: 0.005, priceJump: 0.009, payment: 'Agent credit 15d', contentScore: 0.78, commission: 0.064 },
  { id: 'nomad', name: 'Nomad Rates', kind: 'Bedbank, apartments', mark: 'peak', tile: '#ff6b2c', ink: '#1a0b03', instantConfirm: 0.971, failRate: 0.011, priceJump: 0.024, payment: 'Pay now', contentScore: 0.71, commission: 0.083 },
  { id: 'sandline', name: 'Sandline DMC', kind: 'Local DMC, tours and transfers', mark: 'waves', tile: '#f4f4f0', ink: '#111111', instantConfirm: 0.958, failRate: 0.02, priceJump: 0.012, payment: 'Pay later 7d', contentScore: 0.64, commission: 0.112 },
  { id: 'corvid', name: 'Corvid Travel', kind: 'Retail aggregator API', mark: 'arc', tile: '#1b1d1c', ink: '#ffffff', instantConfirm: 0.932, failRate: 0.026, priceJump: 0.041, payment: 'Pay now', contentScore: 0.9, commission: 0.052 },
  { id: 'halo', name: 'Halo Experiences', kind: 'Activities marketplace', mark: 'sun', tile: '#ffd23f', ink: '#1a1405', instantConfirm: 0.964, failRate: 0.009, priceJump: 0.015, payment: 'Agent credit 15d', contentScore: 0.88, commission: 0.094 },
  { id: 'orbit', name: 'Orbit Hotels Direct', kind: 'Chain direct connect', mark: 'diamond', tile: '#0f7a5c', ink: '#eafff6', instantConfirm: 0.981, failRate: 0.006, priceJump: 0.007, payment: 'Pay at hotel', contentScore: 0.93, commission: 0.048 },
  { id: 'tide', name: 'Tidewater Tours', kind: 'Tour operator, Gulf', mark: 'drop', tile: '#2a2d2b', ink: '#9fe7ff', instantConfirm: 0.917, failRate: 0.031, priceJump: 0.022, payment: 'Pay now', contentScore: 0.58, commission: 0.121 },
]

export const SUPPLIER_BY_ID: Record<string, Supplier> = Object.fromEntries(SUPPLIERS.map((s) => [s.id, s]))

/** 0..100, rolling SLA score used for ranking: confirmation, failures and price jumps. */
export function reliabilityScore(s: Supplier): number {
  const v = s.instantConfirm * (1 - 2.2 * s.failRate) * (1 - 1.4 * s.priceJump)
  return Math.round(Math.max(0, Math.min(1, (v - 0.82) / 0.18)) * 100)
}
