// Inventory network: destination clusters as seen by Indian B2B agents (market: Mumbai).
// Numbers are synthetic but internally consistent (canonical <= raw, dedup = 1 - canonical/raw).

export type Rollout = 'live' | 'shadow' | 'planned'

export interface Destination {
  rollout: Rollout
  phase: string
  id: string
  name: string
  region: string
  lon: number
  lat: number
  raw: number // raw supplier listings (hotels + sightseeing)
  canonical: number // canonical products after Prism
  suppliers: number
  priceGap: number // avg saving found per booking by cross-supplier comparison, INR
  instantConfirm: number
  review: number // grey-zone matches waiting in the review queue
  searches?: number // weekly searches from the Mumbai market, shown on links
  link?: boolean
  label: 'left' | 'right' | 'top' | 'bottom'
  topSuppliers: string[]
  months: number[] // bookings by month, INR crore
  kmFromHub: number
}

export const HUB = { name: 'Mumbai', lon: 72.88, lat: 19.08, label: 'Your market, Mumbai' }

export const DESTINATIONS: Destination[] = [
  { rollout: 'shadow', phase: 'Phase 2, months 3 to 4', id: 'dubai', name: 'Dubai', region: 'Dubai, UAE', lon: 55.27, lat: 25.2, raw: 18420, canonical: 6184, suppliers: 14, priceGap: 1240, instantConfirm: 0.94, review: 46, searches: 12400, link: true, label: 'right', topSuppliers: ['atlas', 'meridian', 'nomad', 'sandline', 'corvid'], months: [2.6, 2.9, 2.7, 3.1, 3.0, 3.4, 3.3, 3.6, 3.5, 3.9, 3.8, 4.6], kmFromHub: 1930 },
  { rollout: 'shadow', phase: 'Phase 2, months 3 to 4', id: 'bangkok', name: 'Bangkok', region: 'Bangkok, TH', lon: 100.5, lat: 13.76, raw: 14260, canonical: 5420, suppliers: 12, priceGap: 860, instantConfirm: 0.92, review: 38, searches: 9100, link: true, label: 'left', topSuppliers: ['meridian', 'atlas', 'orbit', 'nomad', 'corvid'], months: [1.9, 2.1, 2.0, 2.2, 2.4, 2.3, 2.6, 2.5, 2.8, 2.7, 3.0, 3.4], kmFromHub: 3020 },
  { rollout: 'live', phase: 'Phase 1, live in this demo', id: 'singapore', name: 'Singapore', region: 'Singapore, SG', lon: 103.82, lat: 1.35, raw: 9880, canonical: 3760, suppliers: 11, priceGap: 1480, instantConfirm: 0.96, review: 21, link: true, label: 'left', topSuppliers: ['orbit', 'atlas', 'meridian', 'halo', 'corvid'], months: [1.6, 1.7, 1.9, 1.8, 2.0, 2.1, 2.0, 2.2, 2.4, 2.3, 2.5, 2.9], kmFromHub: 3910 },
  { rollout: 'shadow', phase: 'Phase 2, months 3 to 4', id: 'delhi', name: 'Delhi NCR', region: 'Delhi, IN', lon: 77.21, lat: 28.61, raw: 11300, canonical: 4020, suppliers: 9, priceGap: 410, instantConfirm: 0.95, review: 29, searches: 7600, link: true, label: 'left', topSuppliers: ['orbit', 'atlas', 'meridian', 'nomad', 'corvid'], months: [1.2, 1.3, 1.2, 1.4, 1.5, 1.4, 1.6, 1.5, 1.7, 1.8, 1.7, 2.1], kmFromHub: 1150 },
  { rollout: 'planned', phase: 'Phase 3, months 5 to 6', id: 'phuket', name: 'Phuket', region: 'Phuket, TH', lon: 98.39, lat: 7.88, raw: 7450, canonical: 3240, suppliers: 10, priceGap: 720, instantConfirm: 0.9, review: 17, label: 'left', topSuppliers: ['nomad', 'atlas', 'halo', 'meridian', 'tide'], months: [0.9, 1.0, 1.1, 1.0, 1.2, 1.1, 1.3, 1.2, 1.4, 1.5, 1.4, 1.8], kmFromHub: 2960 },
  { rollout: 'planned', phase: 'Phase 3, months 5 to 6', id: 'maldives', name: 'Maldives', region: 'Male, MV', lon: 73.51, lat: 4.18, raw: 2640, canonical: 1180, suppliers: 7, priceGap: 2310, instantConfirm: 0.88, review: 12, link: true, label: 'right', topSuppliers: ['meridian', 'orbit', 'atlas', 'nomad', 'corvid'], months: [0.7, 0.8, 0.7, 0.9, 0.8, 1.0, 0.9, 1.1, 1.0, 1.2, 1.1, 1.4], kmFromHub: 1660 },
  { rollout: 'planned', phase: 'Phase 3, months 5 to 6', id: 'colombo', name: 'Colombo', region: 'Colombo, LK', lon: 79.86, lat: 6.93, raw: 2050, canonical: 1010, suppliers: 6, priceGap: 540, instantConfirm: 0.89, review: 9, link: true, label: 'right', topSuppliers: ['atlas', 'nomad', 'meridian', 'tide', 'corvid'], months: [0.4, 0.4, 0.5, 0.4, 0.5, 0.6, 0.5, 0.6, 0.6, 0.7, 0.6, 0.8], kmFromHub: 1530 },
  { rollout: 'planned', phase: 'Phase 3, months 5 to 6', id: 'kathmandu', name: 'Kathmandu', region: 'Kathmandu, NP', lon: 85.32, lat: 27.72, raw: 1180, canonical: 690, suppliers: 5, priceGap: 330, instantConfirm: 0.86, review: 6, link: true, label: 'right', topSuppliers: ['atlas', 'tide', 'nomad', 'meridian', 'corvid'], months: [0.2, 0.2, 0.3, 0.2, 0.3, 0.3, 0.3, 0.4, 0.3, 0.4, 0.4, 0.5], kmFromHub: 1550 },
  { rollout: 'planned', phase: 'Phase 3, months 5 to 6', id: 'kochi', name: 'Kochi', region: 'Kerala, IN', lon: 76.27, lat: 9.93, raw: 1460, canonical: 1190, suppliers: 4, priceGap: 190, instantConfirm: 0.91, review: 3, label: 'right', topSuppliers: ['orbit', 'atlas', 'sandline', 'nomad', 'corvid'], months: [0.3, 0.3, 0.3, 0.4, 0.3, 0.4, 0.4, 0.4, 0.5, 0.4, 0.5, 0.6], kmFromHub: 1080 },
  { rollout: 'planned', phase: 'Phase 3, months 5 to 6', id: 'seychelles', name: 'Seychelles', region: 'Mahe, SC', lon: 55.45, lat: -4.62, raw: 640, canonical: 520, suppliers: 3, priceGap: 880, instantConfirm: 0.84, review: 2, label: 'right', topSuppliers: ['meridian', 'orbit', 'atlas', 'nomad', 'corvid'], months: [0.1, 0.1, 0.2, 0.1, 0.2, 0.2, 0.2, 0.2, 0.3, 0.2, 0.3, 0.3], kmFromHub: 3330 },
  { rollout: 'planned', phase: 'Phase 3, months 5 to 6', id: 'yangon', name: 'Yangon', region: 'Yangon, MM', lon: 96.15, lat: 16.87, raw: 420, canonical: 350, suppliers: 3, priceGap: 160, instantConfirm: 0.83, review: 1, label: 'top', topSuppliers: ['atlas', 'nomad', 'tide', 'meridian', 'corvid'], months: [0.05, 0.05, 0.06, 0.05, 0.07, 0.06, 0.07, 0.08, 0.07, 0.08, 0.09, 0.1], kmFromHub: 2540 },
]

export const dedupRate = (d: Destination) => 1 - d.canonical / d.raw

export type Metric = 'volume' | 'dedup' | 'gap'
export type Band = 'high' | 'mid' | 'low'

export const METRICS: Record<Metric, { label: string; legend: [string, string, string]; band: (d: Destination) => Band }> = {
  volume: {
    label: 'Volume',
    legend: ['Over 8k', '2k to 8k', 'Under 2k'],
    band: (d) => (d.raw >= 8000 ? 'high' : d.raw >= 2000 ? 'mid' : 'low'),
  },
  dedup: {
    label: 'Duplicates',
    legend: ['Over 55%', '30 to 55%', 'Under 30%'],
    band: (d) => (dedupRate(d) >= 0.55 ? 'high' : dedupRate(d) >= 0.3 ? 'mid' : 'low'),
  },
  gap: {
    label: 'Price gap',
    legend: ['Over ₹1,000', '₹500 to 1,000', 'Under ₹500'],
    band: (d) => (d.priceGap >= 1000 ? 'high' : d.priceGap >= 500 ? 'mid' : 'low'),
  },
}

// Network-wide panels
export const UNIFIED = {
  total: 122.9, // thousand listings merged
  delta: '+9.8%',
  rows: [
    { label: 'Hotel properties', value: 48.2 },
    { label: 'Room types', value: 39.6 },
    { label: 'Attraction tickets', value: 16.1 },
    { label: 'Tours and activities', value: 12.4 },
    { label: 'Day trips', value: 6.6 },
  ],
}

// Match confidence of all candidate pairs, high to low (left = 1.0).
// Lime: auto-merged (>= 0.85), white: LLM arbiter (0.45 to 0.85), grey: kept apart (< 0.45).
// 24 bins of 1/24 from 1.0 down to 0: bins 0..3 auto-merge, 4..12 arbiter, 13..23 kept apart.
export const CONFIDENCE = {
  delta: '+0.04',
  pairs: '41k',
  bins: [0.7, 1.0, 0.95, 0.8, 0.42, 0.33, 0.27, 0.22, 0.19, 0.16, 0.14, 0.12, 0.11, 0.1, 0.09, 0.09, 0.08, 0.08, 0.08, 0.08, 0.09, 0.09, 0.1, 0.11],
  limeUntil: 4,
  whiteUntil: 13,
  labels: ['Auto-merged', 'LLM review', 'Kept apart'] as const,
}

export function confidenceSplit() {
  const b = CONFIDENCE.bins
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
  const total = sum(b)
  const lime = sum(b.slice(0, CONFIDENCE.limeUntil)) / total
  const white = sum(b.slice(CONFIDENCE.limeUntil, CONFIDENCE.whiteUntil)) / total
  // median confidence: walk from the high end until half the pairs are covered
  let acc = 0
  let median = 0
  for (let i = 0; i < b.length; i++) {
    const next = acc + b[i] / total
    if (next >= 0.5) {
      const f = (0.5 - acc) / (b[i] / total)
      median = 1 - (i + f) / b.length
      break
    }
    acc = next
  }
  const pct = (v: number) => Math.round(v * 100)
  const p1 = pct(lime)
  const p2 = pct(white)
  return { median, shares: [p1, p2, 100 - p1 - p2] }
}
