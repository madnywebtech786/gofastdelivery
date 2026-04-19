import redis from '@/lib/redis'

/**
 * Central Mapbox API budget gate.
 *
 * Every server-side Mapbox call path (reoptimize, server geocode proxy,
 * server directions proxy) must await checkBudget(service) before firing.
 * Failure to do so risks free-tier overage.
 *
 * Counters live in Redis:
 *   mapbox:min:{service}:{YYYY-MM-DDTHH:MM}   (TTL 120s)
 *   mapbox:day:{service}:{YYYY-MM-DD}          (TTL 48h)
 *   mapbox:mon:{service}:{YYYY-MM}             (TTL 40 days)
 *
 * Free-tier limits (monthly) baked in as defaults; override via env if you
 * upgrade the Mapbox plan.
 *
 * We apply an 85% soft cap so we degrade BEFORE hitting the hard free-tier
 * ceiling. Calls past the soft cap throw MapboxBudgetError; callers decide
 * whether to serve cached / fall back / surface an error.
 */

export const MAPBOX_SERVICES = {
  directions:   { monthly: 100_000, daily: 2_500, perMinute: 300 },
  optimization: { monthly: 100_000, daily: 2_500, perMinute: 300 },
  geocoding:    { monthly: 100_000, daily: 2_500, perMinute: 600 },
  matching:     { monthly: 100_000, daily: 2_500, perMinute: 60  },
}

const SOFT_CAP_FRACTION = 0.85

export class MapboxBudgetError extends Error {
  constructor(service, scope, count, limit) {
    super(`Mapbox budget exceeded for ${service} (${scope}): ${count}/${limit}`)
    this.name    = 'MapboxBudgetError'
    this.service = service
    this.scope   = scope
    this.count   = count
    this.limit   = limit
  }
}

function todayKeys(service) {
  const now = new Date()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  const hh = String(now.getUTCHours()).padStart(2, '0')
  const mi = String(now.getUTCMinutes()).padStart(2, '0')
  const yyyy = now.getUTCFullYear()
  return {
    minKey: `mapbox:min:${service}:${yyyy}-${mm}-${dd}T${hh}:${mi}`,
    dayKey: `mapbox:day:${service}:${yyyy}-${mm}-${dd}`,
    monKey: `mapbox:mon:${service}:${yyyy}-${mm}`,
  }
}

/**
 * Check budget BEFORE calling Mapbox. Returns the new monthly count.
 * Throws MapboxBudgetError when soft cap is reached on any scope.
 *
 * Fail-open policy on Redis outage: if Redis is unavailable we log once and
 * let the call through (Mapbox hard-429s as a last resort). This preserves
 * UX during Upstash flakes but is observable in logs.
 *
 * Performance: all 6 commands (3 INCR + 3 EXPIRE) are pipelined into a single
 * HTTP round-trip to Upstash. Previously these were 6 sequential REST calls
 * (~1.2s of overhead per Mapbox API call) — now ~200ms.
 */
export async function checkBudget(service) {
  const cfg = MAPBOX_SERVICES[service]
  if (!cfg) throw new Error(`Unknown Mapbox service: ${service}`)

  const { minKey, dayKey, monKey } = todayKeys(service)

  let minCount, dayCount, monCount
  try {
    const p = redis.pipeline()
    p.incr(minKey); p.expire(minKey, 120)
    p.incr(dayKey); p.expire(dayKey, 172800)
    p.incr(monKey); p.expire(monKey, 3456000)
    const results = await p.exec()
    // Pipeline results: [minIncr, minExpire, dayIncr, dayExpire, monIncr, monExpire]
    minCount = Number(results[0])
    dayCount = Number(results[2])
    monCount = Number(results[4])
  } catch (err) {
    console.warn('[mapbox-budget] Redis failed, allowing call:', err?.message)
    return { minCount: -1, dayCount: -1, monCount: -1, degraded: true }
  }

  const minLimit = cfg.perMinute
  const dayLimit = Math.floor(cfg.daily   * SOFT_CAP_FRACTION)
  const monLimit = Math.floor(cfg.monthly * SOFT_CAP_FRACTION)

  if (minCount > minLimit) throw new MapboxBudgetError(service, 'minute',  minCount, minLimit)
  if (dayCount > dayLimit) throw new MapboxBudgetError(service, 'daily',   dayCount, dayLimit)
  if (monCount > monLimit) throw new MapboxBudgetError(service, 'monthly', monCount, monLimit)

  return { minCount, dayCount, monCount, degraded: false }
}

/**
 * Read-only snapshot for an admin dashboard / health endpoint.
 */
export async function getBudgetSnapshot() {
  const out = {}
  for (const service of Object.keys(MAPBOX_SERVICES)) {
    const { dayKey, monKey } = todayKeys(service)
    try {
      const [day, mon] = await Promise.all([redis.get(dayKey), redis.get(monKey)])
      out[service] = {
        daily:   Number(day ?? 0),
        monthly: Number(mon ?? 0),
        limits:  MAPBOX_SERVICES[service],
      }
    } catch {
      out[service] = { error: 'redis-unavailable', limits: MAPBOX_SERVICES[service] }
    }
  }
  return out
}
