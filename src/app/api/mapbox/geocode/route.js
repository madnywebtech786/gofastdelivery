import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { handleApiError } from '@/lib/dal'
import redis from '@/lib/redis'
import { checkBudget, MapboxBudgetError } from '@/lib/mapbox-budget'
import { checkRateLimit } from '@/lib/redis'

// Guest callers (no session) are rate-limited separately to prevent budget abuse
const GUEST_GEOCODE_LIMIT  = 60  // per IP per hour
const GUEST_GEOCODE_WINDOW = 3600

const MAPBOX_API = 'https://api.mapbox.com'
const REVERSE_CACHE_TTL = 7 * 24 * 3600 // 7 days
const FORWARD_CACHE_TTL = 24 * 3600     // 1 day (search terms evolve)

function getToken() {
  return process.env.MAPBOX_SECRET_TOKEN
}

// Round to ~1m cell so neighbouring pan frames share the same cache entry.
function snapCoord(n) {
  return Number(n).toFixed(5)
}

function normalizeQuery(q) {
  return String(q ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * GET /api/mapbox/geocode?type=reverse&lng=..&lat=..
 * GET /api/mapbox/geocode?type=forward&q=..
 *
 * Proxies Mapbox Geocoding server-side to:
 *   - keep our secret token out of the browser,
 *   - gate calls via checkBudget (soft-cap free-tier),
 *   - cache results in Redis (reverse=7d by rounded lng/lat; forward=1d by query).
 *
 * Returns JSON compatible with the old client-side helpers so switching is drop-in.
 *   reverse → { address, city }
 *   forward → { features: [...] }  (max 5)
 */
export async function GET(request) {
  try {
    const session = await getSession()

    if (!session?.userId) {
      // Guest — apply a separate rate limit so unauthenticated callers
      // cannot exhaust the geocoding budget on behalf of logged-in users.
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
      const { allowed } = await checkRateLimit(`rate:geocode-guest:${ip}`, GUEST_GEOCODE_LIMIT, GUEST_GEOCODE_WINDOW)
      if (!allowed) {
        return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
      }
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    const token = getToken()
    if (!token) return NextResponse.json({ error: 'Mapbox token not configured' }, { status: 500 })

    if (type === 'reverse') {
      const lng = Number(searchParams.get('lng'))
      const lat = Number(searchParams.get('lat'))
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        return NextResponse.json({ error: 'lng/lat required' }, { status: 400 })
      }
      const cacheKey = `mbx:rev:${snapCoord(lng)}:${snapCoord(lat)}`

      try {
        const cached = await redis.get(cacheKey)
        if (cached && typeof cached === 'object') return NextResponse.json(cached)
      } catch { /* fall through */ }

      try {
        await checkBudget('geocoding')
      } catch (err) {
        if (err instanceof MapboxBudgetError) {
          return NextResponse.json(
            { address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, city: '', degraded: true },
            { status: 200 },
          )
        }
        throw err
      }

      const url = `${MAPBOX_API}/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&limit=1&types=address,place`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) {
        return NextResponse.json(
          { address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, city: '' },
          { status: 200 },
        )
      }
      const data = await res.json()
      const feature  = data.features?.[0]
      const address  = feature?.place_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      const placeCtx = feature?.context?.find((c) => c.id?.startsWith('place.'))
      const city     = placeCtx?.text ?? (feature?.place_type?.[0] === 'place' ? feature.text : '') ?? ''
      const payload  = { address, city }

      try { await redis.set(cacheKey, payload, { ex: REVERSE_CACHE_TTL }) } catch { /* non-fatal */ }
      return NextResponse.json(payload)
    }

    if (type === 'forward') {
      const q = normalizeQuery(searchParams.get('q'))
      if (q.length < 3) {
        return NextResponse.json({ features: [] })
      }
      const cacheKey = `mbx:fwd:${q}`

      try {
        const cached = await redis.get(cacheKey)
        if (cached && typeof cached === 'object') return NextResponse.json(cached)
      } catch { /* fall through */ }

      try {
        await checkBudget('geocoding')
      } catch (err) {
        if (err instanceof MapboxBudgetError) {
          return NextResponse.json({ features: [], degraded: true })
        }
        throw err
      }

      const url = `${MAPBOX_API}/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${token}&limit=5&autocomplete=true`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) return NextResponse.json({ features: [] })
      const data = await res.json()
      const payload = { features: data.features ?? [] }

      try { await redis.set(cacheKey, payload, { ex: FORWARD_CACHE_TTL }) } catch { /* non-fatal */ }
      return NextResponse.json(payload)
    }

    return NextResponse.json({ error: 'type must be reverse or forward' }, { status: 400 })
  } catch (err) {
    return handleApiError(err, '[GET /api/mapbox/geocode]')
  }
}
