// Vercel Function: plain-language trip request -> structured trip intent (same shape as
// src/engine/travelIntent.ts TravelIntent).
//
// Order: Redis cache -> Claude Haiku 5.5 (ANTHROPIC_API_KEY) -> Gemini Flash-Lite (GEMINI_API_KEY) -> { fallback },
// and on a fallback the browser runs its own rule parser. Redis also enforces a per-caller hourly limit and a
// daily cap on model calls, so a prepaid credit balance or a free tier can't be drained by one busy demo.
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { caller, redis, sha, today } from './_lib/redis.js'

const FIELD = z.enum(['destination', 'category', 'party', 'dates', 'budget', 'mustHaves'])

const TripIntent = z.object({
  destination: z.string().nullable(),
  category: z.enum(['sightseeing', 'hotel', 'both']).nullable(),
  party: z.object({ adults: z.number().int().nullable(), children: z.number().int().nullable() }),
  dates: z.object({ start: z.string().nullable(), end: z.string().nullable(), label: z.string().nullable() }),
  budgetPerPersonINR: z.number().nullable(),
  must: z.object({
    transfer: z.boolean(),
    privateTransfer: z.boolean(),
    freeCancellation: z.boolean(),
    meal: z.boolean(),
    skipTheLine: z.boolean(),
    family: z.boolean(),
  }),
  prefer: z.object({
    lowWalking: z.boolean(),
    relaxing: z.boolean(),
    evening: z.boolean(),
    wildlife: z.boolean(),
    views: z.boolean(),
    water: z.boolean(),
  }),
  questions: z.array(
    z.object({ id: FIELD, question: z.string(), options: z.array(z.string()), multi: z.boolean(), optional: z.boolean() }),
  ),
})
type Trip = z.infer<typeof TripIntent>
type Source = 'claude' | 'gemini'

const SYSTEM = `You turn a travel agent's or traveller's request into a structured trip intent for OfferGraph, a B2B travel search for Indian travel agents.

Live inventory: Singapore (things to do and hotels). Other destinations are planned; still extract them as written.

Rules:
- Extract only what the request states or clearly implies. Use null for anything unknown; never guess dates, party size or budget.
- destination: the city or country as a short proper name ("Singapore", "Goa"); null if none is named.
- category: "sightseeing" for activities, tours, tickets, attractions or a day out; "hotel" for stays and rooms; "both" when both are asked for; null if unclear.
- party: count adults and children. "family" alone does not give counts, so leave the counts null but set must.family to true. "couple" means 2 adults, 0 children.
- dates: ISO yyyy-mm-dd in start/end when a date is stated (resolve relative dates against today's date given in the request); label is a short human phrase such as "Sat 20 Dec" or "Next weekend".
- budgetPerPersonINR: a per-person budget in rupees if stated (convert "5k" to 5000); null otherwise.
- must: hard requirements the traveller states (transport or hotel pickup -> transfer; private car or private transfer -> privateTransfer; flexible or free cancellation or refundable -> freeCancellation; dinner or meal included -> meal; express pass or skip the line -> skipTheLine; kids, children or family -> family).
- prefer: soft wishes (avoid walking, stroller, elderly parents -> lowWalking; relaxing or easy -> relaxing; night or evening -> evening; animals -> wildlife; views or skyline -> views; boat, cruise or island -> water).
- questions: ask only for the missing required details (destination, category, party, dates), at most 4 questions. Add one optional "budget" question if no budget is stated, and one optional multi-select "mustHaves" question if no requirement is stated. Each question under 8 words, 2 to 4 short options (1 to 4 words each), in plain English.`

const CLAUDE_MODEL = 'claude-haiku-5-5'
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'
const PER_CALLER_HOURLY = 40
const DAILY_CAP = Number(process.env.LLM_DAILY_CAP || 500)

async function viaClaude(text: string, day: string): Promise<Trip | null> {
  const client = new Anthropic({ timeout: 10_000, maxRetries: 1 })
  const res = await client.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 4096, // room for adaptive thinking plus the JSON
    output_config: { effort: 'low', format: zodOutputFormat(TripIntent) },
    system: SYSTEM,
    messages: [{ role: 'user', content: `Today is ${day}.\n\nRequest: ${text}` }],
  })
  // Haiku 5.5 has no server-side refusal fallback; a refusal falls through to the next provider
  if (res.stop_reason === 'refusal') return null
  return res.parsed_output ?? null
}

// Gemini takes a JSON Schema for structured output; the zod schema above is the single source of truth.
const GEMINI_SCHEMA = (() => {
  const s = z.toJSONSchema(TripIntent) as Record<string, unknown>
  delete s.$schema
  return s
})()

async function viaGemini(text: string, day: string): Promise<Trip | null> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY ?? '' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: `Today is ${day}.\n\nRequest: ${text}` }] }],
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: GEMINI_SCHEMA, maxOutputTokens: 2048 },
    }),
    signal: AbortSignal.timeout(9000),
  })
  if (!r.ok) {
    console.warn('gemini status', r.status)
    return null
  }
  const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] }
  const out = (j.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('')
  const parsed = TripIntent.safeParse(JSON.parse(out))
  return parsed.success ? parsed.data : null
}

export async function POST(request: Request): Promise<Response> {
  let text = ''
  try {
    const body = (await request.json()) as { text?: unknown }
    text = typeof body.text === 'string' ? body.text.slice(0, 1000).trim() : ''
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (!text) return Response.json({ error: 'empty_request' }, { status: 400 })

  const hasClaude = !!process.env.ANTHROPIC_API_KEY
  const hasGemini = !!process.env.GEMINI_API_KEY
  // no model configured: a normal answer the browser understands, so it switches to its rule parser quietly
  if (!hasClaude && !hasGemini) return Response.json({ configured: false })

  const day = today()
  const db = redis()
  // the same request on the same day reuses the answer; the raw text itself is not stored
  const key = `og:intent:v2:${day}:${sha(text.toLowerCase().replace(/\s+/g, ' ')).slice(0, 32)}`
  if (db) {
    try {
      const hit = await db.get<Trip & { source: Source }>(key)
      if (hit) {
        await db.hincrby('og:stats:provider', 'cache', 1)
        return Response.json({ ...hit, text, cached: true })
      }
      const id = caller(request)
      const hour = new Date().toISOString().slice(0, 13)
      const p = db.pipeline()
      p.incr(`og:rl:${id}:${hour}`)
      p.expire(`og:rl:${id}:${hour}`, 3600)
      p.incr(`og:llm:${day}`)
      p.expire(`og:llm:${day}`, 2 * 86400)
      const [mine, , all] = await p.exec<[number, number, number, number]>()
      if (mine > PER_CALLER_HOURLY || all > DAILY_CAP) return Response.json({ fallback: 'limit' })
    } catch (error) {
      console.warn('redis unavailable, answering without cache or limits', error)
    }
  }

  let trip: Trip | null = null
  let source: Source | null = null
  if (hasClaude) {
    try {
      trip = await viaClaude(text, day)
      if (trip) source = 'claude'
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) console.warn('claude rate limited')
      else if (error instanceof Anthropic.AuthenticationError) console.warn('claude key rejected')
      else if (error instanceof Anthropic.APIError) console.warn('claude api error', error.status)
      else console.warn('claude failed', error)
    }
  }
  if (!trip && hasGemini) {
    try {
      trip = await viaGemini(text, day)
      if (trip) source = 'gemini'
    } catch (error) {
      console.warn('gemini failed', error)
    }
  }
  if (!trip || !source) return Response.json({ fallback: 'llm_unavailable' })

  const result = { ...trip, source }
  if (db) {
    try {
      const p = db.pipeline()
      p.set(key, result, { ex: 3 * 86400 })
      p.hincrby('og:stats:provider', source, 1)
      await p.exec()
    } catch (error) {
      console.warn('redis write failed', error)
    }
  }
  return Response.json({ ...result, text })
}
