import { NextResponse } from 'next/server'
import { requireAny, handleApiError } from '@/lib/dal'
import { checkBudget, MapboxBudgetError } from '@/lib/mapbox-budget'
import redis from '@/lib/redis'

const MAPBOX_API = 'https://api.mapbox.com'
const CACHE_TTL  = 600 // 10 min — a driver→stop corridor is stable for minutes

function getToken() {
  return process.env.MAPBOX_SECRET_TOKEN
}

function snap(n, decimals = 4) {
  // ~11m at the equator at 4dp — good corridor-reuse cell without masking turns.
  return Number(n).toFixed(decimals)
}

/**
 * POST /api/mapbox/directions
 * Body: { from: { lng, lat }, to: { lng, lat }, withSteps?: boolean }
 *
 * Returns { geometry, distance, duration, steps? } — same shape DriverMap needs.
 *
 * Used by DriverMap for the driver → activeStop leg. Gated + cached server-side.
 * withSteps=false is enough when we only want a redrawn polyline (no new maneuvers).
 */
export async function POST(request) {
  try {
    await requireAny()
    const { from, to, withSteps = true } = await request.json()
    if (!from || !to || !Number.isFinite(from.lng) || !Number.isFinite(from.lat) || !Number.isFinite(to.lng) || !Number.isFinite(to.lat)) {
      return NextResponse.json({ error: 'from/to { lng, lat } required' }, { status: 400 })
    }

    const token = getToken()
    if (!token) return NextResponse.json({ error: 'Mapbox token not configured' }, { status: 500 })

    const cacheKey = `mbx:dir:${snap(from.lng)},${snap(from.lat)}->${snap(to.lng)},${snap(to.lat)}:${withSteps ? 's' : 'g'}`
    try {
      const cached = await redis.get(cacheKey)
      if (cached && typeof cached === 'object') return NextResponse.json({ ...cached, cached: true })
    } catch { /* fall through */ }

    try {
      await checkBudget('directions')
    } catch (err) {
      if (err instanceof MapboxBudgetError) {
        return NextResponse.json({ error: 'Mapbox budget exceeded, try later', degraded: true }, { status: 503 })
      }
      throw err
    }

    const coordStr = `${from.lng},${from.lat};${to.lng},${to.lat}`
    const url = new URL(`${MAPBOX_API}/directions/v5/mapbox/driving/${coordStr}`)
    url.searchParams.set('access_token', token)
    url.searchParams.set('geometries', 'polyline6')
    url.searchParams.set('overview',   'full')
    if (withSteps) url.searchParams.set('steps', 'true')

    const res = await fetch(url.toString(), { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ error: 'Mapbox directions error' }, { status: 502 })
    const data = await res.json()
    const route = data.routes?.[0]
    if (!route) return NextResponse.json({ error: 'No route found' }, { status: 404 })

    const payload = {
      geometry: route.geometry,
      distance: Math.round(route.distance),
      duration: Math.round(route.duration),
      steps:    withSteps ? (route.legs?.[0]?.steps ?? []) : undefined,
    }

    try { await redis.set(cacheKey, payload, { ex: CACHE_TTL }) } catch { /* non-fatal */ }
    return NextResponse.json(payload)
  } catch (err) {
    return handleApiError(err, '[POST /api/mapbox/directions]')
  }
}
