// Vercel Function: count one committed search for the live analytics (structured fields only, never the raw text).
import { caller, redis, today } from './_lib/redis.js'

const CATEGORIES = ['sightseeing', 'hotel', 'both']
const PROVIDERS = ['claude', 'gemini', 'rules']

export async function POST(request: Request): Promise<Response> {
  const db = redis()
  if (!db) return Response.json({ ok: false, reason: 'not_configured' })
  let body: { destination?: unknown; category?: unknown; live?: unknown; provider?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }
  const dest = (typeof body.destination === 'string' ? body.destination : '').toLowerCase().replace(/[^a-z .'-]/g, '').trim().slice(0, 32) || 'unknown'
  const cat = typeof body.category === 'string' && CATEGORIES.includes(body.category) ? body.category : 'unknown'
  const provider = typeof body.provider === 'string' && PROVIDERS.includes(body.provider) ? body.provider : 'rules'
  const live = body.live === true

  try {
    const hour = new Date().toISOString().slice(0, 13)
    const rl = `og:rl:t:${caller(request)}:${hour}`
    const [n] = await db.pipeline().incr(rl).expire(rl, 3600).exec<[number, number]>()
    if (n > 120) return Response.json({ ok: false, reason: 'limit' })

    const day = today()
    const p = db.pipeline()
    p.incr('og:stats:searches')
    p.incr(`og:stats:searches:${day}`)
    p.expire(`og:stats:searches:${day}`, 40 * 86400)
    p.hincrby('og:stats:dest', dest, 1)
    p.hincrby('og:stats:cat', cat, 1)
    p.hincrby('og:stats:coverage', live ? 'live' : 'not-live', 1)
    p.hincrby('og:stats:understood', provider, 1)
    p.lpush('og:stats:recent', JSON.stringify({ d: dest, c: cat, live, at: Date.now() }))
    p.ltrim('og:stats:recent', 0, 49)
    await p.exec()
    return Response.json({ ok: true })
  } catch (error) {
    console.warn('track failed', error)
    return Response.json({ ok: false, reason: 'redis_error' })
  }
}
