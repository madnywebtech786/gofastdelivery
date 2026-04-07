import { Redis } from '@upstash/redis'

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  throw new Error('Upstash Redis environment variables are not set')
}

/**
 * Upstash Redis REST client.
 * Uses HTTP — compatible with Vercel serverless (no persistent TCP needed).
 */
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export default redis

// --- Convenience helpers ---

/**
 * Increment a counter with an expiry (for rate limiting and daily caps).
 * Returns the new count.
 * @param {string} key
 * @param {number} ttlSeconds
 */
export async function incrementWithExpiry(key, ttlSeconds) {
  const count = await redis.incr(key)
  if (count === 1) {
    // Only set TTL on first increment to avoid resetting the window
    await redis.expire(key, ttlSeconds)
  }
  return count
}

/**
 * Rate limit check. Returns { allowed: boolean, count: number }.
 * @param {string} key
 * @param {number} maxRequests
 * @param {number} windowSeconds
 */
export async function checkRateLimit(key, maxRequests, windowSeconds) {
  const count = await incrementWithExpiry(key, windowSeconds)
  return { allowed: count <= maxRequests, count }
}
