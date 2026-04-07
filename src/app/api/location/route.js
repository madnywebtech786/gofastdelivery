import { NextResponse } from 'next/server'
import { requireDriver } from '@/lib/dal'
import { getDb } from '@/lib/db/client'
import { ObjectId } from 'mongodb'
import { checkRateLimit } from '@/lib/redis'

export async function POST(request) {
  try {
    const { userId } = await requireDriver()

    // Rate limit: max 60 location submissions per minute per driver
    const { allowed } = await checkRateLimit(`rate:location:${userId}`, 60, 60)
    if (!allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    const { routeId, points } = await request.json()

    if (!routeId || !Array.isArray(points) || points.length < 2) {
      return NextResponse.json({ error: 'routeId and at least 2 points required' }, { status: 400 })
    }

    // Validate point structure
    for (const p of points) {
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number' || typeof p.ts !== 'number') {
        return NextResponse.json({ error: 'Invalid point format' }, { status: 400 })
      }
    }

    // Limit trace size (cost protection: max 100 points)
    const trimmedPoints = points.slice(-100)

    // Save trace to MongoDB (TTL index auto-deletes after 24h)
    const db = await getDb()
    const trace = await db.collection('location_traces').insertOne({
      driverId: new ObjectId(userId),
      routeId: new ObjectId(routeId),
      points: trimmedPoints,
      triggeredReroute: false,
      processedAt: null,
      createdAt: new Date(),
    })

    // Fire-and-forget to Render worker — do NOT await (non-blocking)
    const workerUrl = process.env.WORKER_URL
    const workerSecret = process.env.WORKER_SECRET
    if (workerUrl && workerSecret) {
      fetch(`${workerUrl}/process-trace`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-worker-secret': workerSecret,
        },
        body: JSON.stringify({
          traceId: trace.insertedId.toString(),
          driverId: userId,
          routeId,
          points: trimmedPoints,
        }),
      }).catch((err) => {
        console.warn('[location] Worker ping failed (non-fatal):', err.message)
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[POST /api/location]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
