import 'dotenv/config'
import express from 'express'
import { ObjectId } from 'mongodb'
import { getDb } from './lib/db.js'
import { checkDeviation } from './lib/deviation.js'
import { runMapMatching, getOptimizedRoute } from './lib/mapbox.js'
import { reorderStops } from './lib/optimizer.js'

const app = express()
app.use(express.json({ limit: '256kb' }))

const PORT = process.env.PORT || 8080

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() })
})

// ─── Main route: process location trace from driver ──────────────────────────
app.post('/process-trace', async (req, res) => {
  // 1. Validate shared secret
  const secret = req.headers['x-worker-secret']
  if (!secret || secret !== process.env.WORKER_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { traceId, driverId, routeId, points } = req.body

  if (!driverId || !routeId || !Array.isArray(points) || points.length < 2) {
    return res.status(400).json({ error: 'driverId, routeId, and at least 2 points required' })
  }

  // Respond immediately — do processing asynchronously so driver isn't waiting
  res.json({ received: true })

  try {
    await processTrace({ traceId, driverId, routeId, points })
  } catch (err) {
    console.error('[worker] processTrace failed:', err.message)
  }
})

// ─── Core processing logic ────────────────────────────────────────────────────
async function processTrace({ traceId, driverId, routeId, points }) {
  const db = await getDb()

  // Load current active route from MongoDB
  const route = await db.collection('routes').findOne({
    _id: new ObjectId(routeId),
    isActive: true,
  })

  if (!route) {
    console.log(`[worker] Route ${routeId} not found or inactive — skipping`)
    return
  }

  // 2. Check deviation — cost gate (no Mapbox call yet)
  const { deviated, maxDeviationM } = checkDeviation(points, route.encodedPolyline)

  console.log(
    `[worker] driverId=${driverId} maxDeviation=${maxDeviationM.toFixed(0)}m deviated=${deviated}`
  )

  if (!deviated) {
    // Mark trace as processed, no reroute needed
    if (traceId) {
      await db.collection('location_traces').updateOne(
        { _id: new ObjectId(traceId) },
        { $set: { triggeredReroute: false, processedAt: new Date() } }
      )
    }
    return
  }

  // 3. Deviation confirmed — run Map Matching (billable API call)
  console.log(`[worker] Deviation detected (${maxDeviationM.toFixed(0)}m) — running map matching`)

  let matchResult
  try {
    matchResult = await runMapMatching(points)
  } catch (err) {
    console.error('[worker] Map matching failed:', err.message)
    return
  }

  // 4. Re-order remaining stops from driver's current position
  const lastPoint = points[points.length - 1]
  const driverPos = { lat: lastPoint.lat, lng: lastPoint.lng }

  // Only re-optimize stops that haven't been completed yet
  const remainingStops = (route.optimizedStops ?? []).filter((s) => !s.completedAt)
  const reorderedStops = reorderStops(driverPos, remainingStops)

  if (reorderedStops.length < 2) {
    console.log('[worker] Not enough remaining stops to reroute')
    return
  }

  // 5. Get new route geometry for the re-ordered stops
  const stopCoords = reorderedStops.map((s) => ({
    lng: s.coordinates.lng,
    lat: s.coordinates.lat,
  }))

  let newRoute
  try {
    newRoute = await getOptimizedRoute(stopCoords)
  } catch (err) {
    console.error('[worker] Directions API failed:', err.message)
    return
  }

  // 6. Update route in MongoDB
  await db.collection('routes').updateOne(
    { _id: new ObjectId(routeId) },
    {
      $set: {
        optimizedStops: reorderedStops,
        encodedPolyline: newRoute.encodedPolyline,
        totalDistanceMeters: newRoute.distanceMeters,
        totalDurationSeconds: newRoute.durationSeconds,
        lastMatchedAt: new Date(),
        updatedAt: new Date(),
      },
    }
  )

  // Mark trace as processed
  if (traceId) {
    await db.collection('location_traces').updateOne(
      { _id: new ObjectId(traceId) },
      { $set: { triggeredReroute: true, processedAt: new Date() } }
    )
  }

  // 7. Notify Next.js app to push Pusher event to driver
  const nextAppUrl = process.env.NEXT_APP_URL
  const workerSecret = process.env.WORKER_SECRET
  if (!nextAppUrl || !workerSecret) {
    console.warn('[worker] NEXT_APP_URL or WORKER_SECRET not set — cannot notify app')
    return
  }

  try {
    const notifyRes = await fetch(`${nextAppUrl}/api/worker/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-secret': workerSecret,
      },
      body: JSON.stringify({
        routeId,
        driverId,
        optimizedStops: reorderedStops,
        encodedPolyline: newRoute.encodedPolyline,
        totalDistanceMeters: newRoute.distanceMeters,
        totalDurationSeconds: newRoute.durationSeconds,
      }),
    })

    if (!notifyRes.ok) {
      const text = await notifyRes.text()
      console.error(`[worker] Notify app failed ${notifyRes.status}: ${text}`)
    } else {
      console.log(`[worker] Route updated and driver notified via Pusher`)
    }
  } catch (err) {
    console.error('[worker] Failed to notify app:', err.message)
  }
}

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Courier worker listening on port ${PORT}`)
})
