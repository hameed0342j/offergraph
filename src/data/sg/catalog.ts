import type { CatalogEntity, Cluster } from '../../engine/types'

// Ground truth for the labelled synthetic Singapore dataset. Real attractions, approximate
// coordinates; variants and prices are synthetic. `walking: null` means no source states it.

export const HOTEL = { name: 'Your hotel, Orchard', short: 'Orchard', lon: 103.8325, lat: 1.3045 }

export const CLUSTERS: Cluster[] = [
  { id: 'mandai', name: 'Mandai', area: 'Mandai, SG', lon: 103.7905, lat: 1.4035, label: 'left', transferMin: 32 },
  { id: 'sentosa', name: 'Sentosa', area: 'Sentosa, SG', lon: 103.8215, lat: 1.2555, label: 'left', transferMin: 24 },
  { id: 'marina', name: 'Marina Bay', area: 'Downtown, SG', lon: 103.8615, lat: 1.2845, label: 'top', transferMin: 14 },
  { id: 'changi', name: 'Changi', area: 'Changi, SG', lon: 103.9894, lat: 1.3602, label: 'top', transferMin: 27 },
  { id: 'jurong', name: 'Jurong', area: 'Jurong East, SG', lon: 103.7357, lat: 1.3332, label: 'left', transferMin: 26 },
  { id: 'ubin', name: 'Pulau Ubin', area: 'North East, SG', lon: 103.9600, lat: 1.4090, label: 'right', transferMin: 41 },
  { id: 'eastcoast', name: 'East Coast', area: 'Marine Parade, SG', lon: 103.9250, lat: 1.3020, label: 'bottom', transferMin: 19 },
  { id: 'kranji', name: 'Kranji', area: 'Lim Chu Kang, SG', lon: 103.7200, lat: 1.4300, label: 'left', transferMin: 38 },
  { id: 'islands', name: 'Southern Islands', area: 'Southern Islands, SG', lon: 103.8520, lat: 1.2230, label: 'right', transferMin: 35 },
]

const v = (
  id: string,
  name: string,
  transfer: 'none' | 'shared' | 'private',
  durationH: number,
  o: Partial<{ access: 'standard' | 'fast-track' | 'vip'; meals: 'none' | 'snack' | 'meal' | 'fine'; activities: string[]; guide: 'self' | 'audio' | 'group' | 'private' }> = {},
) => ({
  id,
  name,
  transfer,
  durationH,
  access: o.access ?? 'standard',
  meals: o.meals ?? 'none',
  activities: o.activities ?? [],
  guide: o.guide ?? 'self',
})

export const CATALOG: CatalogEntity[] = [
  {
    id: 'night-safari', name: 'Night Safari', aliases: ['Night Safari Singapore', 'Singapore Night Safari', 'Mandai Night Safari'],
    cluster: 'mandai', lon: 103.788, lat: 1.4022, category: 'wildlife', walking: 'low', family: true, relaxing: true, photo: 'night-safari',
    variants: [
      v('ns-ticket', 'Admission', 'none', 3),
      v('ns-tram', 'Admission + tram ride', 'none', 3, { activities: ['tram'] }),
      v('ns-tram-transfer', 'Tram ride + hotel transfer', 'shared', 4.5, { activities: ['tram'] }),
      v('ns-dinner', 'Tram, buffet dinner + transfer', 'shared', 5, { activities: ['tram'], meals: 'meal' }),
      v('ns-private', 'Private guided, VIP tram + transfer', 'private', 4.5, { activities: ['tram'], access: 'vip', guide: 'private' }),
    ],
  },
  {
    id: 'zoo', name: 'Singapore Zoo', aliases: ['Singapore Zoological Gardens', 'Mandai Zoo', 'Zoo Singapore'],
    cluster: 'mandai', lon: 103.793, lat: 1.4043, category: 'wildlife', walking: 'high', family: true, relaxing: false, photo: 'zoo',
    variants: [
      v('zoo-ticket', 'Admission', 'none', 4),
      v('zoo-tram', 'Admission + tram', 'none', 4, { activities: ['tram'] }),
      v('zoo-breakfast', 'Breakfast in the wild + transfer', 'shared', 5, { meals: 'meal' }),
    ],
  },
  {
    id: 'river-wonders', name: 'River Wonders', aliases: ['River Safari', 'River Wonders Singapore'],
    cluster: 'mandai', lon: 103.7895, lat: 1.404, category: 'wildlife', walking: 'moderate', family: true, relaxing: true, photo: 'river-wonders',
    variants: [
      v('rw-ticket', 'Admission', 'none', 2.5),
      v('rw-boat', 'Admission + Amazon river boat', 'none', 3, { activities: ['boat ride'] }),
    ],
  },
  {
    id: 'bird-paradise', name: 'Bird Paradise', aliases: ['Bird Paradise Mandai', 'Jurong Bird Park'],
    cluster: 'mandai', lon: 103.787, lat: 1.405, category: 'wildlife', walking: null, family: true, relaxing: true, photo: 'bird-paradise',
    variants: [
      v('bp-ticket', 'Admission', 'none', 3),
      v('bp-transfer', 'Admission + hotel transfer', 'shared', 4.5),
    ],
  },
  {
    id: 'uss', name: 'Universal Studios Singapore', aliases: ['USS', 'Universal Studios Sentosa', 'Universal Studios'],
    cluster: 'sentosa', lon: 103.8238, lat: 1.254, category: 'theme park', walking: 'high', family: true, relaxing: false, photo: 'uss',
    variants: [
      v('uss-day', 'One-day ticket', 'none', 8),
      v('uss-express', 'One-day ticket + Express', 'none', 8, { access: 'fast-track' }),
      v('uss-transfer', 'One-day ticket + hotel transfer', 'shared', 9),
    ],
  },
  {
    id: 'sea-aquarium', name: 'S.E.A. Aquarium', aliases: ['SEA Aquarium', 'Singapore Oceanarium', 'SEA Aquarium Sentosa'],
    cluster: 'sentosa', lon: 103.82, lat: 1.2585, category: 'aquarium', walking: 'moderate', family: true, relaxing: true, photo: 'sea-aquarium',
    variants: [
      v('sea-ticket', 'Admission', 'none', 2.5),
      v('sea-transfer', 'Admission + hotel transfer', 'shared', 4),
    ],
  },
  {
    id: 'cable-car', name: 'Singapore Cable Car', aliases: ['Sentosa Cable Car', 'Cable Car Sky Network', 'Mount Faber Cable Car'],
    cluster: 'sentosa', lon: 103.818, lat: 1.264, category: 'viewpoint', walking: 'low', family: true, relaxing: true, photo: 'cable-car',
    variants: [
      v('cc-round', 'Sky Network round trip', 'none', 1.5),
      v('cc-transfer', 'Round trip + hotel transfer', 'shared', 3),
      v('cc-dining', 'Sky dining cabin + transfer', 'private', 2.5, { meals: 'fine' }),
    ],
  },
  {
    id: 'luge', name: 'Skyline Luge Sentosa', aliases: ['Skyline Luge', 'Sentosa Luge'],
    cluster: 'sentosa', lon: 103.816, lat: 1.251, category: 'outdoor', walking: 'moderate', family: true, relaxing: false, photo: 'luge',
    variants: [
      v('luge-3', 'Three rides', 'none', 1.5, { activities: ['luge x3'] }),
      v('luge-3-sky', 'Three rides + Skyride', 'none', 2, { activities: ['luge x3', 'skyride'] }),
    ],
  },
  {
    id: 'wings', name: 'Wings of Time', aliases: ['Wings of Time Show', 'Sentosa Night Show'],
    cluster: 'sentosa', lon: 103.8165, lat: 1.2508, category: 'show', walking: 'low', family: true, relaxing: true, photo: 'wings',
    variants: [
      v('wot-show', 'Show ticket', 'none', 1),
      v('wot-transfer', 'Show + hotel transfer', 'shared', 2.5),
      v('wot-premium', 'Premium seat + dinner', 'none', 2.5, { access: 'vip', meals: 'meal' }),
    ],
  },
  {
    id: 'gardens', name: 'Gardens by the Bay', aliases: ['Gardens by the Bay Domes', 'Flower Dome and Cloud Forest', 'GBTB'],
    cluster: 'marina', lon: 103.8636, lat: 1.2816, category: 'garden', walking: 'moderate', family: true, relaxing: true, photo: 'gardens',
    variants: [
      v('gbtb-domes', 'Flower Dome + Cloud Forest', 'none', 2.5, { activities: ['two domes'] }),
      v('gbtb-domes-transfer', 'Two domes + hotel transfer', 'shared', 4, { activities: ['two domes'] }),
      v('gbtb-skyway', 'Two domes + OCBC Skyway', 'none', 3, { activities: ['two domes', 'skyway'] }),
      v('gbtb-private', 'Private guided + transfer', 'private', 3.5, { activities: ['two domes'], guide: 'private' }),
    ],
  },
  {
    id: 'skypark', name: 'Marina Bay Sands SkyPark', aliases: ['MBS SkyPark Observation Deck', 'SkyPark Observation Deck', 'Marina Bay Sands Observation Deck'],
    cluster: 'marina', lon: 103.861, lat: 1.2834, category: 'viewpoint', walking: 'low', family: true, relaxing: true, photo: 'skypark',
    variants: [
      v('sp-deck', 'Observation deck', 'none', 1),
      v('sp-deck-transfer', 'Observation deck + hotel transfer', 'shared', 2.5),
    ],
  },
  {
    id: 'flyer', name: 'Singapore Flyer', aliases: ['Singapore Flyer Observation Wheel', 'Flyer Singapore'],
    cluster: 'marina', lon: 103.8631, lat: 1.2893, category: 'viewpoint', walking: 'low', family: true, relaxing: true, photo: 'flyer',
    variants: [
      v('fly-std', 'Standard flight', 'none', 1),
      v('fly-transfer', 'Flight + hotel transfer', 'shared', 2.5),
      v('fly-dining', 'Sky dining flight', 'none', 2, { meals: 'fine', access: 'vip' }),
    ],
  },
  {
    id: 'river-cruise', name: 'Singapore River Cruise', aliases: ['Bumboat River Cruise', 'Clarke Quay River Cruise', 'River Cruise Singapore'],
    cluster: 'marina', lon: 103.8466, lat: 1.2884, category: 'cruise', walking: 'low', family: true, relaxing: true, photo: 'river-cruise',
    variants: [
      v('rc-cruise', 'Bumboat cruise', 'none', 0.75, { activities: ['boat ride'] }),
      v('rc-transfer', 'Cruise + hotel transfer', 'shared', 2, { activities: ['boat ride'] }),
    ],
  },
  {
    id: 'hop-on', name: 'City Sightseeing Bus', aliases: ['City Sightseeing Hop-on Hop-off', 'Singapore City Sightseeing Bus Tour'],
    cluster: 'marina', lon: 103.855, lat: 1.2925, category: 'tour', walking: 'low', family: true, relaxing: true, photo: 'hop-on',
    variants: [
      v('hoho-24', '24-hour pass', 'none', 24),
      v('hoho-48', '48-hour pass', 'none', 48),
    ],
  },
  {
    id: 'chinatown-walk', name: 'Chinatown Food Walk', aliases: ['Chinatown Food Tour', 'Chinatown Heritage Walk'],
    cluster: 'marina', lon: 103.8443, lat: 1.2817, category: 'tour', walking: 'high', family: false, relaxing: false, photo: 'chinatown',
    variants: [
      v('ct-group', 'Small-group walk with tastings', 'none', 3, { meals: 'snack', guide: 'group' }),
    ],
  },
  {
    id: 'jewel', name: 'Jewel Changi Canopy Park', aliases: ['Canopy Park Jewel', 'Jewel Changi Airport', 'Jewel Rain Vortex Canopy Park'],
    cluster: 'changi', lon: 103.9894, lat: 1.3602, category: 'garden', walking: 'moderate', family: true, relaxing: true, photo: 'jewel',
    variants: [
      v('jw-canopy', 'Canopy Park', 'none', 2),
      v('jw-canopy-transfer', 'Canopy Park + hotel transfer', 'shared', 4),
      v('jw-bridge', 'Canopy Park + bridge and mazes', 'none', 2.5, { activities: ['canopy bridge', 'hedge maze'] }),
    ],
  },
  {
    id: 'science-centre', name: 'Science Centre Singapore', aliases: ['Singapore Science Centre', 'Science Centre and Snow City'],
    cluster: 'jurong', lon: 103.7357, lat: 1.3332, category: 'museum', walking: 'moderate', family: true, relaxing: false, photo: 'science-centre',
    variants: [
      v('sc-entry', 'Entry', 'none', 3),
      v('sc-snow', 'Entry + Snow City', 'none', 4, { activities: ['snow city'] }),
    ],
  },
  {
    id: 'ubin', name: 'Pulau Ubin Bike Tour', aliases: ['Pulau Ubin Cycling Tour', 'Ubin Island Bike Tour'],
    cluster: 'ubin', lon: 103.96, lat: 1.409, category: 'outdoor', walking: 'high', family: false, relaxing: false, photo: 'ubin',
    variants: [
      v('ubin-guided', 'Guided bike tour + transfer', 'shared', 5, { guide: 'group', activities: ['bike', 'bumboat'] }),
    ],
  },
  {
    id: 'east-coast', name: 'East Coast Park Cycling', aliases: ['East Coast Park Bike Rental', 'East Coast Cycling Tour'],
    cluster: 'eastcoast', lon: 103.925, lat: 1.302, category: 'outdoor', walking: 'moderate', family: true, relaxing: true, photo: 'east-coast',
    variants: [
      v('ec-rental', 'Bike rental, 2 hours', 'none', 2, { activities: ['bike'] }),
      v('ec-guided', 'Guided ride + seafood dinner', 'none', 4, { activities: ['bike'], meals: 'meal', guide: 'group' }),
    ],
  },
  {
    id: 'kranji', name: 'Kranji Countryside Farm Tour', aliases: ['Kranji Farm Tour', 'Kranji Countryside Tour'],
    cluster: 'kranji', lon: 103.72, lat: 1.43, category: 'tour', walking: null, family: true, relaxing: true, photo: 'kranji',
    variants: [
      v('kr-tour', 'Farm tour + transfer', 'shared', 4, { guide: 'group', activities: ['farm visit'] }),
      v('kr-lunch', 'Farm tour, lunch + transfer', 'shared', 5, { guide: 'group', activities: ['farm visit'], meals: 'meal' }),
    ],
  },
  {
    id: 'islands', name: 'Southern Islands Ferry', aliases: ['Kusu and St John Island Ferry', 'Southern Islands Day Trip'],
    cluster: 'islands', lon: 103.852, lat: 1.223, category: 'outdoor', walking: null, family: true, relaxing: true, photo: 'islands',
    variants: [
      v('si-ferry', 'Ferry round trip', 'none', 4, { activities: ['ferry'] }),
      v('si-guided', 'Ferry + guided island walk', 'none', 5, { activities: ['ferry'], guide: 'group' }),
    ],
  },
]

export const ENTITY_TRUTH = Object.fromEntries(CATALOG.map((e) => [e.id, e]))
