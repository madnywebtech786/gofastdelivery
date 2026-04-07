import { NextResponse } from 'next/server'
import { updateRoute } from '@/lib/db/drivers'
import { pushRouteUpdate } from '@/lib/pusher'
import redis from '@/lib/redis'

export async function POST(request) {
  try {
    // Validate shared secret to ensure only the Render worker can call this
    const secret = request.headers.get('x-worker-secret')
    if (!secret || secret !== process.env.WORKER_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { routeId, driverId, optimizedStops, encodedPolyline, totalDistanceMeters, totalDurationSeconds } =
      await request.json()

    if (!routeId || !driverId) {
      return NextResponse.json({ error: 'routeId and driverId are required' }, { status: 400 })
    }

    // Update route document in MongoDB
    await updateRoute(routeId, {
      optimizedStops: optimizedStops ?? [],
      encodedPolyline,
      totalDistanceMeters,
      totalDurationSeconds,
      lastMatchedAt: new Date(),
    })

    const routeData = {
      _id: routeId,
      optimizedStops: optimizedStops ?? [],
      encodedPolyline,
      totalDistanceMeters,
      totalDurationSeconds,
    }

    // Cache updated route in Redis (5 min TTL)
    // Upstash REST client serializes objects automatically — do not JSON.stringify
    try {
      await redis.set(`driver:${driverId}:route`, routeData, { ex: 300 })
    } catch {
      // Non-fatal
    }

    // Push route:updated event to driver via Pusher
    await pushRouteUpdate(driverId, routeData)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[POST /api/worker/notify]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
