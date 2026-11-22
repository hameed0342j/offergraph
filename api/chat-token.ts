// Issues a Nexconn Chat token for the browser. The App Secret stays here; the browser only ever sees the
// public App Key and a token for one user id. Travellers get a per-browser id, the agent desk one shared id.
import { createHash, randomBytes } from 'node:crypto'
import { redis, caller } from './_lib/redis.js'

const API = process.env.NEXCONN_API_HOST || 'https://api.sg-light-api.com' // Singapore data center
export const AGENT_ID = 'og-agent'

export async function POST(request: Request) {
  const key = process.env.NEXCONN_APP_KEY
  const secret = process.env.NEXCONN_APP_SECRET
  if (!key || !secret) return Response.json({ configured: false })

  const body = (await request.json().catch(() => ({}))) as { role?: string; id?: string }
  const agent = body.role === 'agent'
  const id = agent ? AGENT_ID : `t-${String(body.id ?? '').replace(/[^a-z0-9]/gi, '').slice(0, 24) || randomBytes(6).toString('hex')}`

  const r = redis()
  if (r) {
    const k = `og:rl:chat:${caller(request)}`
    const [n] = (await r.pipeline().incr(k).expire(k, 3600, 'NX').exec()) as [number, number]
    if (n > 30) return Response.json({ error: 'limit' }, { status: 429 })
  }

  const nonce = randomBytes(6).toString('hex')
  const ts = String(Date.now())
  const res = await fetch(`${API}/user/getToken.json`, {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    headers: {
      'App-Key': key,
      Nonce: nonce,
      Timestamp: ts,
      Signature: createHash('sha1').update(secret + nonce + ts).digest('hex'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ userId: id, name: agent ? 'OfferGraph agent desk' : 'Traveller' }),
  }).catch(() => null)
  const j = (await res?.json().catch(() => null)) as { code?: number; token?: string } | null
  if (!j || j.code !== 200 || !j.token) {
    console.error('nexconn token failed', res?.status, j?.code)
    return Response.json({ error: 'token' }, { status: 502 })
  }
  return Response.json({ configured: true, appKey: key, token: j.token, userId: id, agentId: AGENT_ID }, { headers: { 'Cache-Control': 'no-store' } })
}
