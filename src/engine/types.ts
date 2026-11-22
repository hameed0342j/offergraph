// OfferGraph data model: Entity (real attraction) -> Variant (what you get) -> Offer (a supplier's terms).

export type Transfer = 'none' | 'shared' | 'private'
export type Access = 'standard' | 'fast-track' | 'vip'
export type Meals = 'none' | 'snack' | 'meal' | 'fine'
export type Guide = 'self' | 'audio' | 'group' | 'private'
export type Walking = 'low' | 'moderate' | 'high'
export type Availability = 'instant' | 'on-request' | 'sold-out'

/** The six variant axes. Cancellation is an offer term (axis 7, kept on the offer). */
export interface Inclusions {
  transfer: Transfer
  access: Access
  meals: Meals
  activities: string[] // activity options included, e.g. 'tram', 'boat ride'
  durationH: number
  guide: Guide
}

export interface CatalogVariant extends Inclusions {
  id: string
  name: string // canonical variant name
}

export interface CatalogEntity {
  id: string
  name: string
  aliases: string[] // names suppliers use
  cluster: string
  lon: number
  lat: number
  category: 'wildlife' | 'theme park' | 'aquarium' | 'viewpoint' | 'garden' | 'cruise' | 'show' | 'museum' | 'outdoor' | 'tour'
  walking: Walking | null // ground truth; null = no source states it
  family: boolean
  relaxing: boolean
  variants: CatalogVariant[]
  photo?: string
}

export interface Cluster {
  id: string
  name: string
  area: string
  lon: number
  lat: number
  label: 'left' | 'right' | 'top' | 'bottom'
  transferMin: number // from the family's hotel
}

/** Raw supplier record, as a supplier feed delivers it. Labels are kept apart for evaluation. */
export interface RawRecord {
  id: string
  supplier: string
  supplierCode: string
  title: string
  description: string
  cancellation: string
  priceText: string
  currency: 'INR' | 'SGD' | 'USD'
  lon: number | null
  lat: number | null
  durationText: string | null
  language: string | null
  availability: Availability
  checkedAt: number // epoch ms of the last supplier response
  // ground truth (used only by the benchmark)
  truth: { entity: string; variant: string; cancelH: number | null; walking: Walking | null }
}

export interface Evidence {
  field: 'title' | 'description' | 'cancellation' | 'duration' | 'catalog'
  text: string
}

export interface Parsed<T> {
  value: T | null // null = not stated by any source
  evidence: Evidence | null
}

export interface ParsedOffer {
  record: RawRecord
  priceINR: number
  inclusions: {
    transfer: Parsed<Transfer>
    access: Parsed<Access>
    meals: Parsed<Meals>
    activities: Parsed<string[]>
    durationH: Parsed<number>
    guide: Parsed<Guide>
  }
  cancelH: Parsed<number | 0> // 0 = non-refundable, n = free cancellation until n hours before
  walking: Parsed<Walking>
  family: Parsed<boolean>
  tokens: string[]
}

export interface Offer {
  id: string
  parsed: ParsedOffer
  supplier: string
  priceINR: number
  cancelH: number | null // null unknown, 0 non-refundable
  availability: Availability
  checkedAt: number
}

export interface Variant {
  id: string
  entityId: string
  name: string
  fingerprint: string
  inclusions: { [K in keyof Inclusions]: Inclusions[K] | null }
  offers: Offer[]
}

export interface Entity {
  id: string
  name: string
  cluster: string
  lon: number
  lat: number
  category: CatalogEntity['category']
  walking: Walking | null
  family: boolean | null
  relaxing: boolean
  variants: Variant[]
  records: number
  photo?: string
  contentScore: number
}

export interface MatchPair {
  a: string
  b: string
  score: number
  decision: 'auto' | 'arbiter-same' | 'arbiter-different' | 'apart'
  features: { name: number; geo: number; category: number; tokens: number }
}
