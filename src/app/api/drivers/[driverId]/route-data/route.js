import { NextResponse } from 'next/server'
import { requireDriver, handleApiError } from '@/lib/dal'
import { findActiveRoute } from '@/lib/db/drivers'
import redis from '@/lib/redis'

const ROUTE_CACHE_TTL = 300 // 5 minutes

export async function GET(request, { params }) {
  try {
    const { driverId } = await params // async params — Next.js 16
    const { userId } = await requireDriver()

    // Drivers can only fetch their own route data
    if (driverId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Try Redis cache first
    const cacheKey = `driver:${driverId}:route`
    try {
      const cached = await redis.get(cacheKey)
      // Only serve cache if it's a valid active route with at least one pending stop
      if (cached && typeof cached === 'object' && cached.isActive !== false) {
        const hasPending = (cached.optimizedStops ?? []).some((s) => !s.completedAt)
        if (hasPending) return NextResponse.json(cached)
        // Stale completed route in cache — bust it and fall through to MongoDB
        await redis.del(cacheKey).catch(() => {})
      }
    } catch {
      // Redis unavailable — fall through to MongoDB
    }

    const route = await findActiveRoute(driverId)
    if (!route) {
      return NextResponse.json({ error: 'No active route found' }, { status: 404 })
    }

    const serialized = JSON.parse(JSON.stringify(route))

    // Cache in Redis — store as plain object (Upstash serializes automatically)
    try {
      await redis.set(cacheKey, serialized, { ex: ROUTE_CACHE_TTL })
    } catch {
      // Non-fatal — Redis write failure should not fail the request
    }

    return NextResponse.json(serialized)
  } catch (err) {
    return handleApiError(err, '[GET /api/drivers/[driverId]/route-data]')
  }
}
