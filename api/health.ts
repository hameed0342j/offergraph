// Vercel Function: deployment self-check. A Redis write/read/delete round trip plus which integrations are
// configured (true/false only; no key, token or value is ever returned).
import { randomUUID } from 'node:crypto'
import { redis } from './_lib/redis.js'

export async function GET(): Promise<Response> {
  const db = redis()
  let check: { status: 'ok' | 'not_configured' | 'error'; ms?: number; write?: boolean; read?: boolean; deleted?: boolean } = { status: 'not_configured' }
  if (db) {
    const key = `og:health:${randomUUID()}`
    const value = randomUUID()
    const t0 = Date.now()
    try {
      const write = (await db.set(key, value, { ex: 30 })) === 'OK'
      const read = (await db.get<string>(key)) === value
      const deleted = (await db.del(key)) === 1 && (await db.get(key)) === null
      check = { status: write && read && deleted ? 'ok' : 'error', ms: Date.now() - t0, write, read, deleted }
    } catch {
      check = { status: 'error', ms: Date.now() - t0 }
    }
  }
  return Response.json(
    {
      region: process.env.VERCEL_REGION ?? 'local',
      redis: check,
      understanding: process.env.ANTHROPIC_API_KEY ? 'claude-haiku-5-5 (gemini backup)' : process.env.GEMINI_API_KEY ? 'gemini' : 'rules only',
      suppliers: {
        viator: !!process.env.VIATOR_API_KEY,
        hotelbedsActivities: !!(process.env.HOTELBEDS_ACTIVITIES_KEY && process.env.HOTELBEDS_ACTIVITIES_SECRET),
        hotelbedsHotels: !!(process.env.HOTELBEDS_HOTELS_KEY && process.env.HOTELBEDS_HOTELS_SECRET),
      },
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
