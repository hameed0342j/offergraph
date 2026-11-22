import { mulberry32, FX } from './generate'

// Labelled synthetic hotel feed for Singapore. Real properties and approximate locations; names
// as suppliers send them, rates and room strings are synthetic. Look-alike pairs are deliberate
// traps (Pan Pacific Orchard vs Pan Pacific Singapore, Hotel Jen Orchardgateway vs Tanglin).

export interface HotelTruth {
  id: string
  name: string
  aliases: string[]
  stars: number
  lon: number
  lat: number
  address: string
  postcode: string
  phone: string
  amenities: string[]
  rooms: RoomTruth[]
  photo?: string
}

export interface RoomTruth {
  id: string
  cls: 'Standard' | 'Deluxe' | 'Premier' | 'Club' | 'Family' | 'Suite'
  bed: 'King' | 'Twin' | 'Queen x2'
  view: 'City' | 'Bay' | 'Garden' | 'None'
  occ: number
  base: number // INR per night, room only
}

const R = (id: string, cls: RoomTruth['cls'], bed: RoomTruth['bed'], view: RoomTruth['view'], occ: number, base: number): RoomTruth => ({ id, cls, bed, view, occ, base })

export const HOTELS: HotelTruth[] = [
  { id: 'pp-orchard', name: 'Pan Pacific Orchard', aliases: ['Pan Pacific Orchard Singapore', 'PAN PACIFIC ORCHARD SG', 'Pan Pacific Orchard, Singapore'], stars: 5, lon: 103.8277, lat: 1.3058, address: '10 Claymore Road', postcode: '229540', phone: '+65 6737 0811', amenities: ['pool', 'gym', 'spa', 'wifi', 'restaurant', 'kids club'], photo: 'h-pp-orchard', rooms: [R('ppo-dlx-k', 'Deluxe', 'King', 'City', 2, 21400), R('ppo-dlx-t', 'Deluxe', 'Twin', 'City', 2, 21400), R('ppo-fam', 'Family', 'Queen x2', 'Garden', 4, 33800), R('ppo-club', 'Club', 'King', 'City', 2, 30900)] },
  { id: 'pp-singapore', name: 'Pan Pacific Singapore', aliases: ['Pan Pacific Singapore Marina', 'PAN PACIFIC SINGAPORE', 'Pan Pacific Hotel Singapore'], stars: 5, lon: 103.859, lat: 1.2931, address: '7 Raffles Boulevard', postcode: '039595', phone: '+65 6336 8111', amenities: ['pool', 'gym', 'wifi', 'restaurant', 'bar'], photo: 'h-pp-singapore', rooms: [R('pps-dlx-k', 'Deluxe', 'King', 'City', 2, 18900), R('pps-dlx-bay', 'Deluxe', 'King', 'Bay', 2, 22400), R('pps-fam', 'Family', 'Queen x2', 'City', 4, 29600)] },
  { id: 'mbs', name: 'Marina Bay Sands', aliases: ['Marina Bay Sands Hotel', 'MBS Singapore', 'Marina Bay Sands Resort'], stars: 5, lon: 103.861, lat: 1.2834, address: '10 Bayfront Avenue', postcode: '018956', phone: '+65 6688 8888', amenities: ['infinity pool', 'gym', 'spa', 'wifi', 'casino', 'restaurant', 'skypark'], photo: 'h-mbs', rooms: [R('mbs-dlx-city', 'Deluxe', 'King', 'City', 2, 41900), R('mbs-prem-bay', 'Premier', 'King', 'Bay', 2, 52600), R('mbs-fam', 'Family', 'Queen x2', 'City', 4, 61800)] },
  { id: 'fullerton', name: 'The Fullerton Hotel Singapore', aliases: ['Fullerton Hotel', 'The Fullerton Hotel', 'FULLERTON HOTEL SINGAPORE'], stars: 5, lon: 103.8531, lat: 1.2863, address: '1 Fullerton Square', postcode: '049178', phone: '+65 6733 8388', amenities: ['pool', 'gym', 'spa', 'wifi', 'restaurant', 'heritage tours'], photo: 'h-fullerton', rooms: [R('ful-court', 'Deluxe', 'King', 'City', 2, 27800), R('ful-quay', 'Premier', 'King', 'Bay', 2, 34600)] },
  { id: 'shangri', name: 'Shangri-La Singapore', aliases: ['Shangri-La Hotel Singapore', 'Shangri La Singapore', 'SHANGRI-LA SG'], stars: 5, lon: 103.8264, lat: 1.311, address: '22 Orange Grove Road', postcode: '258350', phone: '+65 6737 3644', amenities: ['pool', 'gym', 'spa', 'wifi', 'kids club', 'garden'], photo: 'h-shangri', rooms: [R('sh-dlx-k', 'Deluxe', 'King', 'Garden', 2, 24300), R('sh-dlx-t', 'Deluxe', 'Twin', 'Garden', 2, 24300), R('sh-fam', 'Family', 'Queen x2', 'Garden', 4, 36200)] },
  { id: 'jen-orchard', name: 'Hotel Jen Orchardgateway', aliases: ['Hotel Jen Orchardgateway Singapore', 'Jen Orchardgateway', 'HOTEL JEN ORCHARDGATEWAY'], stars: 4, lon: 103.8395, lat: 1.3005, address: '277 Orchard Road', postcode: '238858', phone: '+65 6708 8888', amenities: ['pool', 'gym', 'wifi', 'restaurant'], photo: 'h-jen', rooms: [R('jo-dlx-k', 'Deluxe', 'King', 'City', 2, 14200), R('jo-dlx-t', 'Deluxe', 'Twin', 'City', 2, 14200), R('jo-club', 'Club', 'King', 'City', 2, 19900)] },
  { id: 'jen-tanglin', name: 'Hotel Jen Tanglin', aliases: ['Hotel Jen Tanglin Singapore', 'Jen Tanglin', 'HOTEL JEN TANGLIN SG'], stars: 4, lon: 103.8231, lat: 1.3058, address: '1A Cuscaden Road', postcode: '249716', phone: '+65 6738 2222', amenities: ['pool', 'gym', 'wifi'], photo: 'h-jen-tanglin', rooms: [R('jt-std', 'Standard', 'King', 'None', 2, 11900), R('jt-dlx-t', 'Deluxe', 'Twin', 'City', 2, 13400)] },
  { id: 'ibis-bencoolen', name: 'ibis Singapore on Bencoolen', aliases: ['Ibis Bencoolen', 'IBIS SINGAPORE BENCOOLEN', 'ibis Singapore Bencoolen Street'], stars: 3, lon: 103.8513, lat: 1.2988, address: '170 Bencoolen Street', postcode: '189657', phone: '+65 6593 2888', amenities: ['wifi', 'restaurant'], photo: 'h-ibis', rooms: [R('ib-std-q', 'Standard', 'King', 'None', 2, 8400), R('ib-std-t', 'Standard', 'Twin', 'None', 2, 8400)] },
  { id: 'village-sentosa', name: 'Village Hotel Sentosa', aliases: ['Village Hotel Sentosa by Far East', 'VILLAGE HTL SENTOSA', 'Sentosa Village Hotel'], stars: 4, lon: 103.8263, lat: 1.2509, address: '10 Artillery Avenue', postcode: '099951', phone: '+65 6722 0818', amenities: ['pool', 'wifi', 'kids pool', 'restaurant'], photo: 'h-village', rooms: [R('vs-dlx', 'Deluxe', 'King', 'Garden', 2, 16700), R('vs-fam', 'Family', 'Queen x2', 'Garden', 4, 24800)] },
  { id: 'crowne-changi', name: 'Crowne Plaza Changi Airport', aliases: ['Crowne Plaza Singapore Changi Airport', 'CROWNE PLAZA CHANGI', 'Crowne Plaza Changi Airport Hotel'], stars: 5, lon: 103.9867, lat: 1.3586, address: '75 Airport Boulevard', postcode: '819664', phone: '+65 6823 5300', amenities: ['pool', 'gym', 'wifi', 'restaurant', 'airport access'], photo: 'h-crowne', rooms: [R('cc-dlx', 'Deluxe', 'King', 'Garden', 2, 19800), R('cc-prem', 'Premier', 'King', 'City', 2, 23900)] },
  { id: 'yotel', name: 'YOTEL Singapore Orchard Road', aliases: ['Yotel Singapore', 'YOTEL ORCHARD', 'Yotel Orchard Road Singapore'], stars: 4, lon: 103.833, lat: 1.306, address: '366 Orchard Road', postcode: '238904', phone: '+65 6866 8000', amenities: ['pool', 'gym', 'wifi'], photo: 'h-yotel', rooms: [R('yo-prem-q', 'Premier', 'King', 'City', 2, 12900), R('yo-fam', 'Family', 'Queen x2', 'City', 4, 18600)] },
  { id: 'swissotel', name: 'Swissotel The Stamford', aliases: ['Swissotel Stamford Singapore', 'SWISSOTEL THE STAMFORD', 'Swissôtel The Stamford'], stars: 5, lon: 103.853, lat: 1.2934, address: '2 Stamford Road', postcode: '178882', phone: '+65 6338 8585', amenities: ['pool', 'gym', 'spa', 'wifi', 'restaurant', 'bar'], photo: 'h-swissotel', rooms: [R('sw-cls-k', 'Deluxe', 'King', 'City', 2, 22100), R('sw-bay', 'Premier', 'King', 'Bay', 2, 27300)] },
]

export interface HotelRecord {
  id: string
  supplier: string
  name: string
  address: string
  postcode: string | null
  phone: string | null
  stars: number
  lon: number | null
  lat: number | null
  amenities: string[]
  images: { url: string; w: number; h: number; watermark: boolean }[]
  rooms: RoomRecord[]
  truth: { hotel: string }
}

export interface RoomRecord {
  id: string
  raw: string
  priceText: string
  currency: 'INR' | 'SGD' | 'USD'
  available: number // rooms left; 0 = on request
  cancel: string
  truth: { room: string; board: 'RO' | 'BB'; refundable: boolean; freeCancelDays: number | null }
}

const HOTEL_SUPPLIERS = ['atlas', 'meridian', 'nomad', 'orbit', 'corvid'] as const
const TERMS: Record<string, { markup: number; currency: 'INR' | 'SGD' | 'USD' }> = {
  atlas: { markup: 1.0, currency: 'INR' },
  meridian: { markup: 1.03, currency: 'INR' },
  nomad: { markup: 0.95, currency: 'USD' },
  orbit: { markup: 1.05, currency: 'SGD' },
  corvid: { markup: 0.92, currency: 'USD' },
}

const pick = <T,>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)]

function roomString(s: string, room: RoomTruth, board: 'RO' | 'BB', refundable: boolean, r: () => number): string {
  const bed = room.bed === 'King' ? pick(r, ['King', 'DBL', '1 King Bed', 'Double']) : room.bed === 'Twin' ? pick(r, ['Twin', 'TWN', '2 Single Beds', 'Twin Beds']) : pick(r, ['2 Queen Beds', '2 QN', 'Two Queen'])
  const view = room.view === 'None' ? '' : room.view === 'City' ? pick(r, ['City View', 'CITY VW', 'city-view']) : room.view === 'Bay' ? pick(r, ['Bay View', 'Marina Bay View', 'BAY VW']) : pick(r, ['Garden View', 'GRDN VW', 'Pool or Garden View'])
  const brd = board === 'BB' ? pick(r, ['Breakfast', 'BB', 'with breakfast', 'Bed & Breakfast']) : pick(r, ['Room Only', 'RO', 'no meals'])
  const nrf = refundable ? '' : pick(r, ['NRF', 'Non-refundable', 'Advance Purchase'])
  const cls = room.cls === 'Deluxe' ? pick(r, ['Deluxe', 'DLX', 'Deluxe Room']) : room.cls === 'Premier' ? pick(r, ['Premier', 'PREM', 'Premier Room']) : room.cls === 'Club' ? pick(r, ['Club', 'Club Room', 'Executive Club']) : room.cls === 'Family' ? pick(r, ['Family Room', 'FAMILY', 'Family Suite']) : pick(r, ['Standard', 'STD', 'Superior'])
  switch (s) {
    case 'corvid':
      return [cls, bed, view, brd, nrf].filter(Boolean).join(' ').toUpperCase()
    case 'meridian':
      return `${cls} ${bed}${view ? ' - ' + view : ''} (${brd}${nrf ? ', ' + nrf : ''})`
    case 'nomad':
      return `${bed} ${cls}${view ? ' ' + view : ''}, ${brd}${nrf ? ' ' + nrf : ''}`
    default:
      return `${cls} ${view ? view + ' ' : ''}${bed}, ${brd}${nrf ? ', ' + nrf : ''}`
  }
}

export function generateHotels(seed = 8812): HotelRecord[] {
  const r = mulberry32(seed)
  const out: HotelRecord[] = []
  let n = 0
  for (const h of HOTELS) {
    const k = 3 + Math.floor(r() * 3)
    const sups = [...HOTEL_SUPPLIERS]
    for (let i = sups.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      ;[sups[i], sups[j]] = [sups[j], sups[i]]
    }
    for (const s of sups.slice(0, k)) {
      n++
      const t = TERMS[s]
      const name = pick(r, [h.name, ...h.aliases])
      const rooms: RoomRecord[] = []
      let m = 0
      for (const room of h.rooms) {
        if (r() < 0.2) continue // not every supplier sells every room
        for (const board of ['RO', 'BB'] as const) {
          if (board === 'BB' && r() < 0.35) continue
          for (const refundable of [true, false]) {
            if (!refundable && r() < 0.5) continue
            m++
            const inr = room.base * t.markup * (board === 'BB' ? 1.11 : 1) * (refundable ? 1 : 0.9) * (0.97 + r() * 0.07)
            const amount = inr / FX[t.currency]
            const days = refundable ? pick(r, [1, 2, 3, 3, 7]) : null
            rooms.push({
              id: `h${String(n).padStart(2, '0')}r${m}`,
              raw: roomString(s, room, board, refundable, r),
              priceText: t.currency === 'INR' ? `INR ${Math.round(amount / 10) * 10}` : `${t.currency} ${amount.toFixed(2)}`,
              currency: t.currency,
              available: r() < 0.12 ? 0 : 1 + Math.floor(r() * 9),
              cancel: refundable ? (s === 'corvid' ? `FREE CXL ${days}D PRIOR` : `Free cancellation until ${days} day${days! > 1 ? 's' : ''} before check-in`) : s === 'corvid' ? 'NRF' : 'Non-refundable',
              truth: { room: room.id, board, refundable, freeCancelDays: days },
            })
          }
        }
      }
      const jitter = () => (r() - 0.5) * 0.0014
      out.push({
        id: `H${String(n).padStart(2, '0')}`,
        supplier: s,
        name,
        address: r() < 0.5 ? h.address : h.address.replace('Road', 'Rd').replace('Avenue', 'Ave').replace('Boulevard', 'Blvd').replace('Street', 'St'),
        postcode: r() < 0.8 ? h.postcode : null,
        phone: r() < 0.6 ? h.phone : null,
        stars: r() < 0.15 ? h.stars - 0.5 : h.stars,
        lon: s === 'corvid' ? null : h.lon + jitter(),
        lat: s === 'corvid' ? null : h.lat + jitter(),
        amenities: h.amenities.filter(() => r() < 0.75),
        images: [
          { url: h.photo ?? '', w: s === 'orbit' ? 2400 : s === 'atlas' ? 1600 : s === 'corvid' ? 480 : 1024, h: s === 'orbit' ? 1600 : s === 'atlas' ? 1067 : s === 'corvid' ? 320 : 683, watermark: s === 'nomad' || s === 'meridian' },
        ],
        rooms,
        truth: { hotel: h.id },
      })
    }
  }
  // an aggregator listing with no address detail: could be either Pan Pacific property
  const pps = HOTELS.find((h) => h.id === 'pp-singapore')!
  out.push({
    id: `H${String(n + 1).padStart(2, '0')}`,
    supplier: 'corvid',
    name: 'PAN PACIFIC HOTEL',
    address: 'Singapore',
    postcode: null,
    phone: null,
    stars: 5,
    lon: null,
    lat: null,
    amenities: ['pool', 'wifi'],
    images: [{ url: pps.photo ?? '', w: 480, h: 320, watermark: false }],
    rooms: [
      { id: `h${n + 1}r1`, raw: 'DLX KING CITY VW RO', priceText: `USD ${(18200 / FX.USD).toFixed(2)}`, currency: 'USD', available: 2, cancel: 'FREE CXL 1D PRIOR', truth: { room: 'pps-dlx-k', board: 'RO', refundable: true, freeCancelDays: 1 } },
    ],
    truth: { hotel: 'pp-singapore' },
  })
  return out
}
