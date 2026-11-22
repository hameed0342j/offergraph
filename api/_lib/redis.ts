// Server-only Upstash Redis client (files under api/_lib are helpers, not endpoints).
// Reads UPSTASH_REDIS_REST_URL / _TOKEN, or the KV_REST_API_* names the Vercel Marketplace integration injects.
// Nothing here is ever sent to the browser.
import { Redis } from '@upstash/redis'
import { createHash } from 'node:crypto'

let client: Redis | null | undefined

export function redis(): Redis | null {
  if (client !== undefined) return client
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN
  client = url && token ? new Redis({ url, token, retry: { retries: 1, backoff: () => 100 } }) : null
  return client
}

export const sha = (s: string) => createHash('sha256').update(s).digest('hex')

/** Caller id for rate limits: a hash of the client IP, never the IP itself. */
export function caller(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
  return sha(ip).slice(0, 16)
}

export const today = () => new Date().toISOString().slice(0, 10)
