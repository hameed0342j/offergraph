// Vercel Function: live search analytics from Redis (aggregates only; no raw requests, no caller ids).
import { redis, today } from './_lib/redis.js'

type Counts = Record<string, number | string> | null

const sorted = (h: Counts, n = 8) =>
  Object.entries(h ?? {})
    .map(([k, v]) => ({ key: k, count: Number(v) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n)

export async function GET(): Promise<Response> {
  const db = redis()
  if (!db) return Response.json({ configured: false })
  try {
    const p = db.pipeline()
    p.get('og:stats:searches')
    p.get(`og:stats:searches:${today()}`)
    p.hgetall('og:stats:dest')
    p.hgetall('og:stats:cat')
    p.hgetall('og:stats:coverage')
    p.hgetall('og:stats:understood')
    p.hgetall('og:stats:provider')
    p.lrange('og:stats:recent', 0, 9)
    const [all, todayCount, dest, cat, coverage, understood, provider, recent] = await p.exec<
      [number | null, number | null, Counts, Counts, Counts, Counts, Counts, unknown[]]
    >()
    return Response.json(
      {
        configured: true,
        searches: Number(all ?? 0),
        today: Number(todayCount ?? 0),
        destinations: sorted(dest),
        categories: sorted(cat),
        coverage: sorted(coverage),
        understoodBy: sorted(understood),
        modelCalls: sorted(provider),
        recent,
      },
      { headers: { 'cache-control': 'public, s-maxage=10, stale-while-revalidate=30' } },
    )
  } catch (error) {
    console.warn('stats failed', error)
    return Response.json({ configured: true, error: 'redis_error' }, { status: 503 })
  }
}
