# OfferGraph

Multi-supplier offer intelligence for hotels and sightseeing. A VoyageHack 4.0 (TBO) prototype.

OfferGraph turns fragmented supplier inventory into current, comparable, contextually relevant and verifiably bookable offers. A travel agent types an ordinary request; OfferGraph separates must-haves from preferences, matches the same attraction or hotel across suppliers, keeps meaningful differences apart as variants, ranks offers with reasons, watches supplier changes and rechecks price and availability before booking.

## Run it

```
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
```

Live: **https://offergraph-ecru.vercel.app** (Live India page: `/#/live`). Production deploys from this folder with `npx vercel deploy --prod`; server functions run in Mumbai (`bom1`).

The Singapore multi-supplier graph runs in the browser on a labelled synthetic feed, so that part works offline. The Live India page and the language understanding use the server functions in `api/`.

## Search, follow-up questions and personalisation

Type a trip in the search bar. OfferGraph turns it into a structured trip intent (destination, things to do or hotel, travellers, dates, budget, must-haves, preferences). If something required is missing, a follow-up dialog asks for it (answers from earlier searches are pre-selected; they are kept only in this browser). Singapore opens the multi-supplier demo graph; any other destination opens **Live India** with real supplier inventory.

`/api/intent` understands the request in this order: Redis cache (same request, same day) → Claude Haiku 5.5 (`ANTHROPIC_API_KEY`, low effort, structured outputs) → Gemini 3.5 Flash-Lite (`GEMINI_API_KEY`, free tier) → the browser's rule parser. A per-caller hourly limit (40) and a daily cap on model calls (`LLM_DAILY_CAP`, default 500) keep a prepaid balance or free tier from being drained. Haiku 5.5 costs $0.10 / $0.50 per million input / output tokens, about $0.0005 per request here, so $5 of credit covers roughly 10,000 searches.

## Live India (`api/live.ts`, `src/views/Live.tsx`, `src/engine/liveRank.ts`)

Real Viator inventory for any destination it covers (81 Indian cities, plus states such as Goa and Kerala), in rupees:

1. The destination name is resolved against Viator's destination tree (cached in Redis for 7 days; India wins when a name is shared, e.g. Kochi).
2. Must-haves Viator supports natively are applied at the supplier: free cancellation, skip the line, private tour, budget, dates.
3. Listings whose primary destination is somewhere else are dropped (Viator search also returns, say, a Montego Bay tour in Goa).
4. Each product's detail record supplies structured facts: pickup type, fitness level, stroller and wheelchair access, meals, operator (cached 24 h).
5. The browser ranks with pass / fail / not stated checks. A fact stated by the supplier beats a keyword guess, "not stated" never counts as a pass, and "meet at the start point" fails a hotel-pickup request. Multi-day trips and airport transfers sink for a day out.

Searches are cached for 10 minutes. Every committed search is counted in Redis (structured fields only, never the raw text); `/api/stats` returns the aggregates and `/api/health` runs a Redis write/read/delete check and reports which integrations are configured (true/false only).

## Environment variables

Names are in `.env.example`. Locally put values in `.env.local`; on Vercel set them in Project → Settings → Environment Variables (production and preview are set). All are read only by `api/` functions, never by the browser bundle.

| Variable | Service | Status | Unlocks |
|---|---|---|---|
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis, free plan, Mumbai | set | cache, rate limits, live analytics |
| `GEMINI_API_KEY` | Google AI Studio (free tier) | set | request understanding (backup) |
| `ANTHROPIC_API_KEY` | console.anthropic.com (prepaid credits) | not set | Claude Haiku 5.5 as the primary understanding model |
| `VIATOR_API_KEY`, `VIATOR_BASE_URL` | Viator affiliate, production | set | Live India things to do |
| `HOTELBEDS_ACTIVITIES_KEY` + `_SECRET`, `HOTELBEDS_HOTELS_KEY` + `_SECRET` | developer.hotelbeds.com | key only, secret missing | a second live activities supplier, live hotels |

No maps API is needed: the maps are pre-rendered from NASA and Sentinel-2 imagery, and Viator returns coordinates for each destination. Amadeus Self-Service APIs were shut down on 17 July 2026 and are not an option.

## Pages

- **Live India**: real Viator inventory for the request, checks per listing with the supplier's evidence, freshness, links to book on Viator.
- **Offers**: the request-to-offer flow. Request panel (words that produced each constraint are underlined), supplier matching, the Singapore map (hub = the family's hotel, clusters = attraction areas colored by fit, links = transfer times), the selected cluster, ranked offers, the offer detail with reasons (supplier fact / inferred / not verified) and "Recheck before booking". Supplier price changes arrive live on the map and re-rank the list.
- **Compare**: one attraction, raw supplier feed vs OfferGraph variants. Six inclusion axes (transfer, access, meals, activity options, duration, guide and language) plus offer terms (cancellation, availability, payment terms, price checked).
- **Hotels**: property equivalence with evidence, golden record with best-image choice, one row per room and policy with the chosen supplier and alternatives, a human review queue for unresolved look-alikes.
- **Network**: rollout plan across Indian outbound markets (Singapore live in this demo; other market sizes are illustrative).
- **Benchmark**: every number computed in the browser on the labelled set.

## How it works (`src/engine/`)

1. `parse.ts`: supplier record to structured attributes with evidence; negation-aware ("transfer at extra cost" is not a transfer).
2. `resolve.ts`: blocking, pair features (name, location, tokens, alias knowledge), three-way routing (auto 0.85+, arbiter 0.45 to 0.85, apart). The arbiter is a rule set offline; in production it is an LLM returning structured JSON. Variants by inclusion fingerprint.
3. `intent.ts`: plain-language request to hard constraints and soft preferences (rule-based offline; an LLM with the same schema in production).
4. `rank.ts`: hard constraints filter and are never overridden; weighted score (relevance, preferences, price, supplier reliability, content, policy, freshness); TBO margin only breaks near-ties and is never shown to agents.
5. `hotels.ts`: property matching with postcode, phone and distance evidence; room strings to a canonical room key; supplier choice per room.
6. `bench.ts`: 120 generated queries with labels; keyword (BM25) and fuzzy-title baselines.

## Measured on the synthetic set (Benchmark page)

| System | P@10 | Recall@10 | NDCG@10 | Breaks a must-have |
|---|---|---|---|---|
| Keyword search | 0.31 | 0.43 | 0.35 | 59.7% |
| Fuzzy match + price sort | 0.13 | 0.18 | 0.14 | 73.2% |
| OfferGraph | 0.75 | 0.97 | 0.95 | 1.9% |

False merges (share of merged pairs that are different products): one card per attraction 66%, fuzzy title 53%, OfferGraph variants 0.3%. Attraction matching P 1.00 / R 0.99; hotel matching P 1.00 / R 0.96 (one vague listing waits in the review queue).

Limits, stated plainly: the data is synthetic and labelled; the parser and generator share a vocabulary, so extraction accuracy is optimistic; hotel room-key accuracy is 100% for the same reason. No conversion or revenue claims: those need a live pilot.

## Data and names

Attractions and hotels are real places with approximate locations. Prices, availability, room strings and supplier metrics are synthetic. Supplier names (Atlas Beds, Meridian Connect, Nomad Rates, Sandline DMC, Corvid Travel, Halo Experiences, Orbit Hotels Direct, Tidewater Tours) are fictional, so the synthetic reliability figures cannot be read as claims about real companies.

## Credits

- City map: Sentinel-2 cloudless 2016 by EOX IT Services GmbH (https://s2maps.eu), contains modified Copernicus Sentinel data 2016, CC BY 4.0. Graded and water-masked for this app.
- Regional map: NASA Blue Marble and Black Marble (public domain), via Wikimedia Commons.
- Font: Inter (SIL Open Font License), icons: Lucide (ISC).
- Photos (resized and cropped; hotel photos show the property or its surroundings, and the supplier copies with watermarks are generated for the best-image demo):
- `night-safari`: "Night Safari entrance 2016.jpg" by Orderinchaos, CC BY-SA 4.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Night_Safari_entrance_2016.jpg)
- `zoo`: "Two white tigers playing in the water at Singapore Zoo.jpg" by Basile Morin, CC BY-SA 4.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Two_white_tigers_playing_in_the_water_at_Singapore_Zoo.jpg)
- `river-wonders`: "River Safari, Singapore Sign.jpg" by aamanatullah, CC BY 2.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:River_Safari,_Singapore_Sign.jpg)
- `bird-paradise`: "Bird Paradise at Mandai Zoo in Singapore - Ypphotography.jpg" by Phuan Yan Penh, CC BY-SA 4.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Bird_Paradise_at_Mandai_Zoo_in_Singapore_-_Ypphotography.jpg)
- `uss`: "Universal Studios lake (6952709373).jpg" by Ivan Bandura, CC BY 2.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Universal_Studios_lake_(6952709373).jpg)
- `sea-aquarium`: "S.E.A. Aquarium, Sentosa Cove (12472491073).jpg" by KimonBerlin, CC BY-SA 2.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:S.E.A._Aquarium,_Sentosa_Cove_(12472491073).jpg)
- `cable-car`: "Singapore-Sentosa Cable Car in 2023 03.jpg" by Renek78, CC0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Singapore-Sentosa_Cable_Car_in_2023_03.jpg)
- `luge`: "Sentosa Luge 3.JPG" by Terence Ong, CC BY 2.5, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Sentosa_Luge_3.JPG)
- `wings`: "Wings of Time Fireworks Symphony.jpg" by ScribblingGeek, CC BY-SA 4.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Wings_of_Time_Fireworks_Symphony.jpg)
- `gardens`: "Supertree Grove, Gardens by the Bay, Singapore1.jpg" by Mustang Joe, CC0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Supertree_Grove,_Gardens_by_the_Bay,_Singapore1.jpg)
- `skypark`: "Singapore (SG), View from Marina Bay Sands, ArtScience Museum -- 2019 -- 4714.jpg" by Dietmar Rabich, CC BY-SA 4.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Singapore_(SG),_View_from_Marina_Bay_Sands,_ArtScience_Museum_--_2019_--_4714.jpg)
- `flyer`: "Singapore (SG), Singapore Flyer -- 2019 -- 4474.jpg" by Dietmar Rabich, CC BY-SA 4.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Singapore_(SG),_Singapore_Flyer_--_2019_--_4474.jpg)
- `river-cruise`: "Bumboat on the Singapore River near Boat Quay - 20060304.jpg" by Terence Ong., CC BY 2.5, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Bumboat_on_the_Singapore_River_near_Boat_Quay_-_20060304.jpg)
- `hop-on`: "Singapore hop-on hop-off (5620821459).jpg" by Simon_sees from Australia, CC BY 2.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Singapore_hop-on_hop-off_(5620821459).jpg)
- `chinatown`: "Pagoda Street Chinatown Singapore.jpg" by kallerna, CC BY-SA 4.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Pagoda_Street_Chinatown_Singapore.jpg)
- `jewel`: "Rain Vortex Night Jewel Changi Feb23 R16 06856.jpg" by This Photo was taken by Timothy A. Gonsalves.  Feel free to use my photos, but please mention me as the author.  I would, CC BY-SA 4.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Rain_Vortex_Night_Jewel_Changi_Feb23_R16_06856.jpg)
- `science-centre`: "Waterworks, Science Centre Singapore, 2025.jpg" by Actuall7, CC BY 4.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Waterworks,_Science_Centre_Singapore,_2025.jpg)
- `ubin`: "Grey pansy (Junonia atlites atlites) underside Pulau Ubin S.jpg" by Charles J. Sharp, CC BY-SA 4.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Grey_pansy_(Junonia_atlites_atlites)_underside_Pulau_Ubin_S.jpg)
- `east-coast`: "Beach at East Coast Park, Singapore - 20050809-01.jpg" by BertholdD., CC BY-SA 3.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Beach_at_East_Coast_Park,_Singapore_-_20050809-01.jpg)
- `islands`: "Kusu Island, Singapore SF0001.jpg" by Stefan Fussan, CC BY-SA 4.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Kusu_Island,_Singapore_SF0001.jpg)
- `h-pp-orchard`: "Singapore skyscrapers 2.jpg" by Uzoma Ozurumba, CC BY-SA 4.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Singapore_skyscrapers_2.jpg)
- `h-pp-singapore`: "At Singapore 2023 122.jpg" by Photograph by Mike Peel (www.mikepeel.net)., CC BY-SA 4.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:At_Singapore_2023_122.jpg)
- `h-mbs`: "Floating Platform and illuminated East Coast Parkway seen from the sky observation deck of Marina Bay Sands Singapore.jpg" by Basile Morin, CC BY-SA 4.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Floating_Platform_and_illuminated_East_Coast_Parkway_seen_from_the_sky_observation_deck_of_Marina_Bay_Sands_Singapore.jpg)
- `h-fullerton`: "Aerial photographs of The Fullerton Hotel of Singapore at night.jpg" by Basile Morin, CC BY-SA 4.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Aerial_photographs_of_The_Fullerton_Hotel_of_Singapore_at_night.jpg)
- `h-shangri`: "Breakfast time by the pool, Shangri-La Hotel Singapore - 20120826.jpg" by Andrew Thomas from Shrewsbury, UK., CC BY-SA 2.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Breakfast_time_by_the_pool,_Shangri-La_Hotel_Singapore_-_20120826.jpg)
- `h-jen`: "Orchard Gateway Singapore - Museum of Ice Cream.jpg" by Choo Yut Shing, CC BY 2.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Orchard_Gateway_Singapore_-_Museum_of_Ice_Cream.jpg)
- `h-jen-tanglin`: "Tanglin Place.JPG" by Terence Ong, CC BY 2.5, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Tanglin_Place.JPG)
- `h-ibis`: "Bencoolen Street.JPG" by Terence Ong, CC BY 2.5, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Bencoolen_Street.JPG)
- `h-village`: "Casemates, Fort Siloso Square (171549).jpg" by Moheen Reeyad, CC BY-SA 4.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Casemates,_Fort_Siloso_Square_(171549).jpg)
- `h-crowne`: "Crowne Plaza Changi Airport, Singapore - 20120320.jpg" by Katmorro., CC BY-SA 3.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Crowne_Plaza_Changi_Airport,_Singapore_-_20120320.jpg)
- `h-yotel`: "HARD HOTEL partial view of the text ORCHARD HOTEL written on the facade of the building in Orchard Road Singapore.jpg" by Basile Morin, CC BY-SA 4.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:HARD_HOTEL_partial_view_of_the_text_ORCHARD_HOTEL_written_on_the_facade_of_the_building_in_Orchard_Road_Singapore.jpg)
- `h-swissotel`: "Swissôtel The Stamford reflecting in the water.jpg" by Basile Morin, CC BY-SA 4.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Swiss%C3%B4tel_The_Stamford_reflecting_in_the_water.jpg)
