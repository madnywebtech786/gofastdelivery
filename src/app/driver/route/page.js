'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import Spinner from '@/components/ui/Spinner'
import RouteUpdater from '@/components/realtime/RouteUpdater'
import VoiceGuide from '@/components/driver/VoiceGuide'
import { useToast } from '@/components/ui/Toast'
import { reverseGeocode, forwardGeocode } from '@/lib/mapbox-geocode'
import { enqueue as enqueueAction, subscribeQueue } from '@/lib/offline-queue'
import { Search, X, MapPin, Navigation } from 'lucide-react'
import OnlineIndicator from '@/components/ui/OnlineIndicator'


const DriverMap = dynamic(() => import('@/components/map/DriverMap'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-gray-100">
      <Spinner size="lg" />
    </div>
  ),
})

// What to label the CTA button per stop type
function stopActionLabel(stop) {
  if (!stop) return 'Mark Complete'
  if (stop.stopType === 'endpoint') return 'Mark Route Complete'
  if (stop.stopType === 'pickup') return 'Confirm Pickup'
  return 'Confirm Delivery'
}

function formatETA(isoString) {
  if (!isoString) return null
  const d = new Date(new Date(isoString).getTime() + 3 * 60 * 1000)
  if (isNaN(d.getTime())) return null
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function DriverRoutePage() {
  const router = useRouter()
  const toast = useToast()
  const voiceRef    = useRef(null)
  const routeRef    = useRef(null)
  const mapRef      = useRef(null)
  const markerRef   = useRef(null)
  const pendingRouteRef = useRef(null)
  const [newStopIds, setNewStopIds] = useState(new Set()) // bookingIds recently added — pulse briefly
  const [queueDepth, setQueueDepth] = useState(0)         // offline actions waiting to sync

  const [driverId, setDriverId] = useState(null)
  const [route, setRoute] = useState(null)
  const [driverPos, setDriverPos] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sheetOpen, setSheetOpen] = useState(true)
  const [activeStopIndex, setActiveStopIndex] = useState(0)
  const [completing, setCompleting] = useState(false)
  // Per-stop item check state. Key = `${stopIndex}:${itemId}`, value = true when
  // driver has ticked the item. Rebuilt locally — source of truth is the server.
  const [itemChecks, setItemChecks] = useState({})

  // Failed-stop modal state — open when driver taps Failed Pickup/Dropoff.
  const [failedModal, setFailedModal] = useState(null) // { stopIndex, stop } | null
  const [failureReason, setFailureReason] = useState('')
  const [submittingFailure, setSubmittingFailure] = useState(false)

  // ETA timeline: which stop is currently expanded in the sheet
  // null = show timeline list, number = show that stop's detail view
  const [expandedStopIndex, setExpandedStopIndex] = useState(null)

  const [endPointStep, setEndPointStep] = useState('idle')  // 'idle'|'modal'|'ready'|'loaded'
  const [endPoint, setEndPoint] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedEndPoint, setSelectedEndPoint] = useState(null)
  const [confirmingEndPoint, setConfirmingEndPoint] = useState(false)
  const [endPointError, setEndPointError] = useState('')
  const searchDebounceRef  = useRef(null)
  const searchAbortRef     = useRef(null)
  const reverseAbortRef    = useRef(null)
  const mapboxglRef = useRef(null)
  async function loadRoute() {
    setLoading(true)
    setError('')
    try {
      // 1. Get session
      const meRes = await fetch('/api/auth/me')
      if (!meRes.ok) throw new Error('Not authenticated')
      const me = await meRes.json()
      setDriverId(me.userId)

      // 2. Get GPS + route data in parallel
      const [posResult, routeRes] = await Promise.all([
        new Promise((resolve) => {
          if (!navigator.geolocation) return resolve(null)
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
          )
        }),
        fetch(`/api/drivers/${me.userId}/route-data?t=${Date.now()}`, { cache: 'no-store' }),
      ])

      if (posResult) setDriverPos(posResult)

      if (routeRes.status === 404) { setError('no_route'); return }
      if (!routeRes.ok) throw new Error('Failed to load route')

      let routeData = await routeRes.json()

      // Check if route already has an end-point saved in DB
      if (routeData.endPoint) {
        // End-point already set — skip modal and proceed with reroute
        setEndPoint(routeData.endPoint)
        setEndPointStep('ready')
        pendingRouteRef.current = { routeData, posResult }
      } else {
        // No end-point yet — show modal and pause route loading
        pendingRouteRef.current = { routeData, posResult }
        setEndPointStep('modal')
        setLoading(false)
        return
      }

      // If we have the driver's GPS position, re-optimize from their current location.
      // This ensures stop 1 is always the nearest stop, not the first-created one.
      if (posResult) {
        try {
          const rerouteRes = await fetch(`/api/drivers/${me.userId}/reroute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              currentLng: posResult.lng,
              currentLat: posResult.lat,
              endPoint: routeData.endPoint || null,
            }),
          })
          if (rerouteRes.ok) {
            const { route: optimized } = await rerouteRes.json()
            if (optimized) routeData = optimized
          }
        } catch {
          // Non-fatal — fall through with original order
        }
      }

      const allStops = routeData.optimizedStops ?? []
      const resumeIndex = allStops.findIndex((s) => !s.completedAt)
      if (resumeIndex === -1) { setError('no_route'); return }

      setRoute(routeData)
      routeRef.current = routeData
      setActiveStopIndex(resumeIndex)
      setExpandedStopIndex(resumeIndex)
    } catch (err) {
      setError(err.message || 'Failed to load route')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadRoute() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to offline-queue depth so the UI can show "Syncing…" when
  // stop-complete retries are pending after a connectivity drop.
  useEffect(() => subscribeQueue(setQueueDepth), [])

  // Wake lock — prevent screen sleep while driver is on the route page.
  // Re-acquired on tab visibility change (iOS releases it when backgrounded).
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let wakeLock = null
    let released = false

    async function acquire() {
      if (released) return
      try {
        wakeLock = await navigator.wakeLock.request('screen')
      } catch {
        // Permission denied or unavailable — non-fatal
      }
    }

    function onVisible() {
      if (!document.hidden) acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisible)
      wakeLock?.release().catch(() => {})
    }
  }, [])

  // Re-sync on wake: when the tab becomes visible again or the browser reports
  // 'online', re-fetch /route-data. This covers the common case where the
  // phone was locked, Pusher dropped, and our local state is stale.
  useEffect(() => {
    if (!driverId) return
    let cancelled = false

    async function resync() {
      try {
        const res = await fetch(`/api/drivers/${driverId}/route-data?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok || cancelled) return
        const fresh = await res.json()
        if (!fresh?.optimizedStops) return
        routeRef.current = fresh
        setRoute(fresh)
        const resumeIdx = fresh.optimizedStops.findIndex((s) => !s.completedAt)
        setActiveStopIndex(resumeIdx === -1 ? fresh.optimizedStops.length : resumeIdx)
      } catch { /* offline — queue will retry */ }
    }

    function onVisible() { if (!document.hidden) resync() }
    function onOnline()  { resync() }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [driverId])

  // Initialize Mapbox GL when modal opens
  useEffect(() => {
    if (endPointStep !== 'modal' || !driverPos) return

    import('mapbox-gl').then((mod) => {
      const mapboxgl = mod.default
      mapboxglRef.current = mapboxgl
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      if (!token) return

      mapboxgl.accessToken = token

      const mapContainer = document.getElementById('endpoint-map')
      if (!mapContainer) return

      const map = new mapboxgl.Map({
        container: mapContainer,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [driverPos.lng, driverPos.lat],
        zoom: 14,
      })

      mapRef.current = map

      // Wait for map to load before initializing
      if (map.isStyleLoaded()) {
        initializeMapState()
      } else {
        map.on('load', initializeMapState)
      }

      // Cancel any previous reverse geocode and start a new one
      function doReverseGeocode(lng, lat, tok) {
        reverseAbortRef.current?.abort()
        const controller = new AbortController()
        reverseAbortRef.current = controller
        reverseGeocode(lng, lat, tok, controller.signal)
          .then((result) => {
            if (result?.address && reverseAbortRef.current === controller) {
              setSelectedEndPoint({ lng, lat, address: result.address })
            }
          })
          .catch(() => {})
      }

      function initializeMapState() {
        const { lng, lat } = map.getCenter()
        setSelectedEndPoint({ lng, lat, address: `${lat.toFixed(4)}, ${lng.toFixed(4)}` })
        doReverseGeocode(lng, lat, token)

        // On map move: update coords immediately, debounce the geocode request
        let moveTimeout
        const debouncedMove = () => {
          clearTimeout(moveTimeout)
          const { lng, lat } = map.getCenter()
          // Show coordinates immediately so the confirm button always has a value
          setSelectedEndPoint((prev) =>
            prev?.lng === lng && prev?.lat === lat
              ? prev
              : { lng, lat, address: `${lat.toFixed(4)}, ${lng.toFixed(4)}` }
          )
          moveTimeout = setTimeout(() => doReverseGeocode(lng, lat, token), 500)
        }

        map.on('move', debouncedMove)

        // Add driver marker
        const driverEl = document.createElement('div')
        driverEl.style.width = '24px'
        driverEl.style.height = '24px'
        driverEl.style.backgroundImage = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%232563eb" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="8"/></svg>')`
        driverEl.style.backgroundSize = 'contain'

        new mapboxgl.Marker({ element: driverEl })
          .setLngLat([driverPos.lng, driverPos.lat])
          .addTo(map)
      }

      return () => {
        map.remove()
        mapRef.current = null
      }
    })
  }, [endPointStep, driverPos])

  // When end-point is confirmed and ready, load the route with reroute
  useEffect(() => {
    if (endPointStep !== 'ready' || !pendingRouteRef.current || !driverId || !endPoint) return

    const { routeData, posResult } = pendingRouteRef.current
    const processRoute = async () => {
      try {
        let finalRoute = routeData

        if (posResult) {
          try {
            const rerouteRes = await fetch(`/api/drivers/${driverId}/reroute`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                currentLng: posResult.lng,
                currentLat: posResult.lat,
                endPoint,
              }),
            })
            if (rerouteRes.ok) {
              const data = await rerouteRes.json()
              if (data.route) finalRoute = data.route
            } else {
              const errData = await rerouteRes.json()
              console.error('[route] reroute error:', errData)
            }
          } catch (err) {
            console.error('[route] reroute request failed:', err)
          }
        }

        const allStops = finalRoute.optimizedStops ?? []
        const resumeIndex = allStops.findIndex((s) => !s.completedAt)
        if (resumeIndex === -1) {
          setError('All stops appear to be completed. Please refresh or contact support.')
          return
        }

        setRoute(finalRoute)
        routeRef.current = finalRoute
        setActiveStopIndex(resumeIndex)
        setExpandedStopIndex(resumeIndex)
        setEndPointStep('loaded')
      } catch (err) {
        console.error('[route] Error processing route:', err)
        setError(err.message || 'Failed to load route')
      }
    }

    processRoute()
  }, [endPointStep, driverId, endPoint])

  const handleRouteUpdate = useCallback((newRoute) => {
    // Only accept a Pusher route:updated payload if it has optimizedStops.
    // Booking status change events share the driver channel but carry no route data.
    if (!newRoute?.optimizedStops) return

    const prevRoute = routeRef.current
    const prevPhase = prevRoute?.routePhase ?? 'pickup'
    const prevStopKeys = new Set(
      (prevRoute?.optimizedStops ?? []).map((s) => `${s.bookingId}:${s.stopType}`)
    )

    // Merge notice sent by bulk-assign when new bookings were added mid-route
    const mergeNotice = newRoute._mergeNotice
    const addedBookingIds = new Set(mergeNotice?.addedBookingIds ?? [])

    // Detect brand-new stops that weren't in the previous route
    const newlyAddedStops = (newRoute.optimizedStops ?? []).filter(
      (s) => s.bookingId && !prevStopKeys.has(`${s.bookingId}:${s.stopType}`)
    )

    routeRef.current = newRoute
    setRoute(newRoute)

    const resumeIndex = (newRoute.optimizedStops ?? []).findIndex((s) => !s.completedAt)
    if (resumeIndex === -1) {
      setActiveStopIndex(newRoute.optimizedStops.length)
    } else {
      setActiveStopIndex(resumeIndex)
    }

    // Show a toast + voice announcement when stops were added mid-route
    if (newlyAddedStops.length > 0 && prevRoute) {
      const n = newlyAddedStops.length
      toast?.info?.('Route updated', `${n} new stop${n > 1 ? 's' : ''} added by dispatch.`)
      voiceRef.current?.speak(
        n === 1
          ? 'A new stop has been added to your route.'
          : `${n} new stops have been added to your route.`
      )

      // Mark new stops for visual pulse (3s)
      const pulseIds = addedBookingIds.size > 0
        ? addedBookingIds
        : new Set(newlyAddedStops.map((s) => s.bookingId))
      setNewStopIds(pulseIds)
      setTimeout(() => setNewStopIds(new Set()), 3000)
      return
    }

    // Phase-transition announcement (legacy behaviour)
    const phase = newRoute.routePhase ?? 'pickup'
    const wasPickup = prevPhase === 'pickup'
    if (phase === 'dropoff' && wasPickup) {
      voiceRef.current?.speak('All packages collected. Starting delivery run. Follow the new route.')
    } else if (prevRoute) {
      voiceRef.current?.speak('Route updated. Follow the new directions.')
    }
  }, [toast])

  function handleSearchEndPoint(query) {
    setSearchQuery(query)

    // Cancel any pending debounce and in-flight request immediately
    clearTimeout(searchDebounceRef.current)
    searchAbortRef.current?.abort()
    searchAbortRef.current = null

    if (!query.trim()) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }

    setSearchLoading(true)

    // Debounce: only fire after 350 ms of no typing
    searchDebounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      searchAbortRef.current = controller
      try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        const results = await forwardGeocode(query, token, controller.signal)
        setSearchResults(results.slice(0, 5))
      } catch (err) {
        if (err?.name !== 'AbortError') setSearchResults([])
      } finally {
        if (searchAbortRef.current === controller) {
          setSearchLoading(false)
          searchAbortRef.current = null
        }
      }
    }, 350)
  }

  async function selectSearchResult(result) {
    setSearchQuery('')
    setSearchResults([])

    // Fly to the selected location - the crosshair will stay centered
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [result.center[0], result.center[1]],
        zoom: 16,
        duration: 1000,
      })
    }
  }

  function makeEndPointMarkerEl() {
    const el = document.createElement('div')
    el.style.cssText = `
      width:34px;height:34px;border-radius:50%;background:#7c3aed;
      color:#fff;font-size:14px;font-weight:700;display:flex;
      align-items:center;justify-content:center;
      box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid #fff;
      cursor:pointer;user-select:none;
    `
    el.textContent = 'E'
    return el
  }

  function updateMarker(lat, lng, mapboxgl) {
    if (!mapRef.current) return

    if (markerRef.current) markerRef.current.remove()

    const el = makeEndPointMarkerEl()
    const Marker = mapboxgl.Marker
    markerRef.current = new Marker({ element: el })
      .setLngLat([lng, lat])
      .addTo(mapRef.current)
  }

  async function handleUseCurrentLocation() {
    if (driverPos && mapRef.current) {
      // Fly to current location - the crosshair will stay centered
      mapRef.current.flyTo({
        center: [driverPos.lng, driverPos.lat],
        zoom: 16,
        duration: 1000,
      })
    }
  }

  async function handleConfirmEndPoint() {
    if (!selectedEndPoint || !driverId) {
      setEndPointError('Please select an end-point first')
      return
    }
    setConfirmingEndPoint(true)
    setEndPointError('')
    try {
      const res = await fetch(`/api/drivers/${driverId}/set-endpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endPoint: selectedEndPoint }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to set end-point')
      }
      setEndPoint(selectedEndPoint)
      setEndPointStep('ready')
    } catch (err) {
      setEndPointError(err.message || 'Failed to set end-point')
      console.error('Error confirming end-point:', err)
    } finally {
      setConfirmingEndPoint(false)
    }
  }

  async function handleStopComplete(stop, stopIndex) {
    if (!driverId || completing) return

    // If the stop has package items, require all of them to be checked before
    // allowing the stop to be confirmed. The UI already disables the CTA in
    // this case, but we guard here too in case it's clicked via keyboard.
    const items = Array.isArray(stop?.packageItems) ? stop.packageItems : []
    const stage = stop?.stopType === 'pickup' ? 'pickup' : stop?.stopType === 'dropoff' ? 'dropoff' : null
    const ckKey = (it) => `${stop.bookingId}:${stage}:${it.itemId}`
    if (items.length > 0 && stage) {
      const alreadyStamped = items.filter((it) => stage === 'pickup' ? it.pickedUpAt : it.deliveredAt)
      const checkedIds = items
        .filter((it) => itemChecks[ckKey(it)])
        .map((it) => it.itemId)
      const allAccounted = alreadyStamped.length + checkedIds.length >= items.length
      if (!allAccounted) {
        toast?.warning?.('Check every item first', 'Tick each item you have picked up or delivered.')
        return
      }
    }

    setCompleting(true)
    try {
      // Stamp per-item timestamps first so the customer-visible state
      // reflects reality even if stop-complete fails mid-flight.
      if (items.length > 0 && stage && stop.bookingId) {
        const newIds = items
          .filter((it) => itemChecks[ckKey(it)])
          .filter((it) => stage === 'pickup' ? !it.pickedUpAt : !it.deliveredAt)
          .map((it) => it.itemId)
        if (newIds.length > 0) {
          try {
            await fetch(`/api/drivers/${driverId}/mark-items`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bookingId: String(stop.bookingId), stage, itemIds: newIds }),
            })
          } catch {
            // Non-fatal — stop-complete still runs; admin can see missing
            // per-item stamps and follow up.
          }
        }
      }

      const pos = driverPos
      const body = {
        stopIndex,
        currentLng: pos?.lng ?? null,
        currentLat: pos?.lat ?? null,
      }
      const url = `/api/drivers/${driverId}/stop-complete`
      // Stable key: stopIndex + stop signature — server guards on completedAt
      // so duplicate deliveries are safe. Key shape lets retries after reload
      // still match.
      const idempotencyKey = `stop:${driverId}:${route?._id ?? 'x'}:${stopIndex}`

      let updatedRoute = null
      let delivered    = false

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-idempotency-key': idempotencyKey,
          },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          const data = await res.json().catch(() => ({}))
          updatedRoute = data?.route ?? null
          delivered = true
        } else if (res.status >= 500 || res.status === 408 || res.status === 429) {
          // Retryable — queue it
          enqueueAction({ url, body, idempotencyKey, label: `Confirm stop ${stopIndex + 1}` })
          toast?.info?.('Saved offline', 'Your confirmation will sync when you\u2019re back online.')
        } else {
          const data = await res.json().catch(() => ({}))
          console.error('[stop-complete] failed:', data?.error)
        }
      } catch {
        // Network error — durable queue
        enqueueAction({ url, body, idempotencyKey, label: `Confirm stop ${stopIndex + 1}` })
        toast?.info?.('Saved offline', 'Your confirmation will sync when you\u2019re back online.')
      }

      if (delivered && updatedRoute) {
        routeRef.current = updatedRoute
        setRoute(updatedRoute)
        const allStops = updatedRoute.optimizedStops ?? []
        const nextIndex = allStops.findIndex((s) => !s.completedAt)
        const resolvedNext = nextIndex === -1 ? allStops.length : nextIndex
        setActiveStopIndex(resolvedNext)
        // Return to timeline so driver sees all stops with updated ETAs
        setExpandedStopIndex(null)

        const next = allStops[resolvedNext]
        const newPhase = updatedRoute.routePhase ?? 'pickup'
        const wasLastPickup = newPhase === 'dropoff' && (route?.routePhase ?? 'pickup') === 'pickup'
        voiceRef.current?.speak(
          wasLastPickup
            ? 'All packages collected. Starting delivery run.'
            : next
              ? `Stop ${stopIndex + 1} complete. Head to ${next.address}`
              : 'All stops complete! Great work.'
        )
      }
    } finally {
      setCompleting(false)
    }
  }

  async function handleStopFailed() {
    if (!driverId || !failedModal || submittingFailure) return
    const { stopIndex, stop } = failedModal
    const reason = failureReason.trim()
    if (!reason) {
      toast?.warning?.('Reason required', 'Please describe why this stop failed.')
      return
    }

    setSubmittingFailure(true)
    try {
      const res = await fetch(`/api/drivers/${driverId}/stop-failed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stopIndex, reason }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast?.error?.('Could not mark failed', data?.error ?? 'Try again.')
        return
      }
      const data = await res.json().catch(() => ({}))
      const updatedRoute = data?.route ?? null
      if (updatedRoute) {
        routeRef.current = updatedRoute
        setRoute(updatedRoute)
        const allStops = updatedRoute.optimizedStops ?? []
        const nextIndex = allStops.findIndex((s) => !s.completedAt)
        setActiveStopIndex(nextIndex === -1 ? allStops.length : nextIndex)
      }
      const label = stop.stopType === 'dropoff' ? 'Dropoff' : 'Pickup'
      toast?.success?.(`${label} marked failed`, 'Admin can re-assign this booking.')
      setFailedModal(null)
      setFailureReason('')
      // Return to timeline view
      setExpandedStopIndex(null)
    } catch {
      toast?.error?.('Could not mark failed', 'Check your connection and try again.')
    } finally {
      setSubmittingFailure(false)
    }
  }

  // When the active stop advances (after a confirm/fail completes the stop),
  // briefly show the timeline so the driver sees the full picture with the
  // checked stop. The detail for the new active stop is available via tap.
  // We intentionally do NOT auto-open the new stop detail here — the driver
  // may want to review the timeline before acting on the next stop.
  // (expandedStopIndex is set to null inside handleStopComplete / handleStopFailed)

  function handleGoHome() {
    router.push('/driver/home')
  }

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
  }

  // ── Loading state ───────────────────────────────────────────────────────────
  if (loading || endPointStep === 'ready') {
    return (
      <div className="w-full flex items-center justify-center min-h-screen" style={{ background: 'var(--bg)' }}>
        <div className="flex flex-col items-center text-center">
          <Spinner size="lg" />
          <p className="mt-3 text-sm" style={{ color: 'var(--fg-3)' }}>
            {endPointStep === 'ready' ? 'Optimizing your route...' : 'Loading route...'}
          </p>
        </div>
      </div>
    )
  }

  // ── End-point modal ──────────────────────────────────────────────────────────
  if (endPointStep === 'modal') {
    return (
      <div className="fixed inset-0 bg-gray-100 flex flex-col">
        {/* Header */}
        <div className="h-16 bg-white border-b border-border flex items-center justify-between px-4 shadow-sm">
          <h1 className="text-lg font-bold" style={{ color: 'var(--fg)' }}>Set Your End-Point</h1>
          <p className="text-xs" style={{ color: 'var(--fg-3)' }}>Pan map, then place</p>
        </div>

        {/* Map Container */}
        <div className="flex-1 relative min-h-0">
          <div id="endpoint-map" style={{ width: '100%', height: '100%', minHeight: '100%' }} />

          {/* Crosshair - center pin indicator */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <svg width="36" height="44" viewBox="0 0 36 44"
              style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.4))', marginBottom: 22 }}>
              <path d="M18 0C10.268 0 4 6.268 4 14c0 9.941 14 30 14 30S32 23.941 32 14C32 6.268 25.732 0 18 0z" fill="#7c3aed" />
              <circle cx="18" cy="14" r="6" fill="#fff" />
            </svg>
          </div>

          {/* Hint pill */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm text-xs text-foreground px-3 py-1.5 rounded-full shadow border border-border pointer-events-none whitespace-nowrap">
            Pan the map to your end-point
          </div>

          {/* Two action buttons — bottom centre */}
          <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex gap-2 items-center">
            {/* GPS / current-location button — universally recognized crosshair icon */}
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={confirmingEndPoint || !driverPos}
              title="Centre map on my current GPS location"
              className="w-11 h-11 rounded-full text-white flex items-center justify-center shadow-lg transition bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ flexShrink: 0 }}
            >
              {/* Standard GPS crosshair — same icon Google Maps / Apple Maps use */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <line x1="12" y1="2" x2="12" y2="6" />
                <line x1="12" y1="18" x2="12" y2="22" />
                <line x1="2" y1="12" x2="6" y2="12" />
                <line x1="18" y1="12" x2="22" y2="12" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleConfirmEndPoint}
              disabled={confirmingEndPoint || !selectedEndPoint}
              className="px-5 py-2.5 rounded-full text-white text-sm font-semibold shadow-lg transition bg-purple-600 hover:bg-purple-700 active:bg-purple-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {confirmingEndPoint ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 16 16" style={{ animation: 'spin 0.8s linear infinite' }}>
                    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="25 10" />
                  </svg>
                  Setting…
                </>
              ) : (
                <>
                  <Navigation size={14} />
                  Set End-Point
                </>
              )}
            </button>
          </div>
        </div>

        {/* Search box */}
        <div className="absolute top-20 left-4 right-4 max-w-sm">
          <div className="relative flex items-center">
            <Search size={16} style={{ position: 'absolute', left: '12px', color: 'var(--fg-3)', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search for a destination…"
              value={searchQuery}
              onChange={(e) => handleSearchEndPoint(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchQuery.trim()}
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white shadow-sm"
            />
            {/* Right-side indicator: spinner while searching, X to clear */}
            {searchLoading ? (
              <div style={{ position: 'absolute', right: '10px' }}>
                <svg width="16" height="16" viewBox="0 0 16 16" style={{ animation: 'spin 0.8s linear infinite', color: 'var(--accent)' }}>
                  <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="25 10" />
                </svg>
              </div>
            ) : searchQuery ? (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setSearchResults([]) }}
                style={{ position: 'absolute', right: '10px', color: 'var(--fg-3)', lineHeight: 1 }}
              >
                <X size={14} />
              </button>
            ) : null}
          </div>

          {/* Search Results dropdown */}
          {(searchResults.length > 0 || (searchLoading && searchQuery)) && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg z-10 max-h-52 overflow-y-auto">
              {searchLoading && searchResults.length === 0 ? (
                <div className="px-3 py-3 flex items-center gap-2 text-sm" style={{ color: 'var(--fg-3)' }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
                    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="25 10" />
                  </svg>
                  Searching…
                </div>
              ) : searchResults.map((result, i) => (
                <button
                  key={i}
                  onClick={() => selectSearchResult(result)}
                  className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-border last:border-b-0 transition flex items-start gap-2.5"
                  style={{ color: 'var(--fg)' }}
                >
                  <MapPin size={13} style={{ color: '#7c3aed', flexShrink: 0, marginTop: '2px' }} />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{result.text}</div>
                    <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--fg-3)' }}>{result.place_name}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Error message */}
        {endPointError && (
          <div className="absolute bottom-24 left-4 right-4 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
            {endPointError}
          </div>
        )}
      </div>
    )
  }

  // ── No route assigned ───────────────────────────────────────────────────────
  if (error === 'no_route') {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
        <header className="border-b border-border px-4 h-14 flex items-center justify-between sticky top-0 z-40 bg-white shadow-sm">
          <span className="font-bold text-base" style={{ color: 'var(--fg)' }}>Navigation</span>
          <button
            onClick={handleSignOut}
            className="text-xs font-medium px-3 py-1.5 rounded-full transition"
            style={{ background: 'var(--surface-2)', color: 'var(--fg-2)', border: '1px solid var(--border)' }}
          >
            Sign out
          </button>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-4">
          <div className="w-20 h-20 rounded-full flex items-center justify-center bg-white border border-border shadow-sm">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--fg-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 11l19-9-9 19-2-8-8-2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--fg)' }}>No Route Assigned</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--fg-3)' }}>
              Waiting for the dispatcher to assign a booking to you.
            </p>
          </div>
          <button
            onClick={() => loadRoute()}
            className="flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-2xl transition text-white"
            style={{ background: 'var(--accent)', boxShadow: '0 4px 16px rgba(79,70,229,0.25)' }}
          >
            Retry
          </button>
          <button
            onClick={() => handleGoHome()}
            className="text-sm transition"
            style={{ color: 'var(--fg-3)' }}
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 min-h-screen" style={{ background: 'var(--bg)' }}>
        <p className="text-sm text-center" style={{ color: 'var(--fg-3)' }}>{error}</p>
      </div>
    )
  }

  const stops = route?.optimizedStops ?? []
  const currentStop = stops[activeStopIndex]
  const allDone = activeStopIndex >= stops.length
  const routePhase = route?.routePhase ?? 'pickup'
  const pendingDropoffCount = route?.pendingDropoffs?.length ?? 0

  // ── Main map view ───────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 flex flex-col bg-gray-100">

      {/* Top overlay — back + status pill + sign out */}
      <div className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-3 pt-3 pointer-events-none">
        <button
          onClick={() => handleGoHome()}
          className="pointer-events-auto bg-white shadow-md rounded-full w-10 h-10 flex items-center justify-center text-gray-700 text-lg active:bg-gray-100"
        >
          ←
        </button>
        <div className="pointer-events-auto bg-white shadow-md rounded-full px-2 h-9 flex items-center">
          <OnlineIndicator pending={queueDepth} />
        </div>
        <button
          onClick={handleSignOut}
          className="pointer-events-auto bg-white shadow-md rounded-full px-3 h-9 text-xs font-medium text-gray-600 active:bg-gray-100"
        >
          Sign out
        </button>
      </div>

      {/* Full-screen map */}
      <div className="flex-1 relative">
        <DriverMap
          route={route}
          activeStopIndex={activeStopIndex}
          driverPos={driverPos}
          driverId={driverId}
          onStepUpdate={(step) => voiceRef.current?.speakStep(step)}
          onReroute={handleRouteUpdate}
          onArrival={(stopIdx) => {
            voiceRef.current?.speak('Arrived at destination')
            setSheetOpen(true)
            setExpandedStopIndex(stopIdx)
          }}
          newStopIds={newStopIds}
        />
      </div>

      {/* ── Bottom sheet ─────────────────────────────────────────────────────── */}
      <div className="absolute left-0 right-0 bottom-0 z-40">

        {/* ── Toggle bar — always visible peek, tappable to open/close ── */}
        <button
          type="button"
          onClick={() => {
            setSheetOpen((p) => !p)
            // Unlock speech synthesis on first user tap (required by mobile browsers)
            voiceRef.current?.unlock()
          }}
          className="w-full bg-white rounded-t-3xl shadow-2xl px-4 flex items-center justify-between gap-3 focus:outline-none active:bg-gray-50"
          style={{
            touchAction: 'manipulation',
            minHeight: '64px',
            paddingTop: '14px',
            paddingBottom: sheetOpen ? '14px' : 'max(14px, env(safe-area-inset-bottom))',
          }}
        >
          {/* Left: stop info preview */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {!allDone && currentStop ? (
              <>
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: currentStop.stopType === 'endpoint' ? '#7c3aed' : currentStop.stopType === 'pickup' ? '#22c55e' : '#dc2626' }}
                />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    {routePhase === 'pickup' ? 'Pickup run' : 'Delivery run'} · {activeStopIndex + 1}/{stops.length}
                  </p>
                  <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{currentStop.address}</p>
                </div>
              </>
            ) : allDone ? (
              <p className="text-sm font-semibold text-green-600">All stops complete!</p>
            ) : null}
          </div>

          {/* Right: arrow indicator */}
          <div
            className="shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center transition-transform duration-300"
            style={{ transform: sheetOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 9L7 4L12 9" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </button>

        {/* ── Expandable content — 55vh so timeline is comfortably scrollable ── */}
        <div
          className="bg-white overflow-y-auto transition-all duration-300 ease-out"
          style={{
            maxHeight: sheetOpen ? '55vh' : '0px',
            paddingBottom: sheetOpen ? 'env(safe-area-inset-bottom)' : '0px',
          }}
        >
          {allDone ? (
            <div className="px-4 pb-6 pt-2 text-center py-6">
              <p className="text-base font-bold text-gray-900">All stops completed!</p>
              <p className="text-sm text-gray-500 mt-1">Great work today.</p>
              <button
                onClick={() => handleGoHome()}
                className="mt-4 text-white text-sm font-semibold px-6 py-3 rounded-2xl w-full"
                style={{ background: 'var(--accent)' }}
              >
                Back to Dashboard
              </button>
            </div>
          ) : expandedStopIndex !== null && stops[expandedStopIndex] ? (
            /* ── Stop detail view ── */
            (() => {
              const stop = stops[expandedStopIndex]
              const stopIndex = expandedStopIndex
              const isActive = stopIndex === activeStopIndex
              const isDone = !!stop.completedAt
              const stage = stop.stopType === 'pickup' ? 'pickup' : stop.stopType === 'dropoff' ? 'dropoff' : null
              const items = Array.isArray(stop.packageItems) ? stop.packageItems : []
              const ckKey = (it) => `${stop.bookingId}:${stage}:${it.itemId}`
              const stampFor = (it) => stage === 'pickup' ? it.pickedUpAt : it.deliveredAt
              const isChecked = (it) => !!stampFor(it) || !!itemChecks[ckKey(it)]
              const allChecked = items.every(isChecked)
              const checkedCount = items.filter(isChecked).length
              const allItemsAccounted = items.length === 0 || items.every((it) => !!stampFor(it) || !!itemChecks[ckKey(it)])
              const canConfirm = isActive && !isDone && !completing && (!stage || allItemsAccounted)

              function toggleAll(next) {
                setItemChecks((prev) => {
                  const out = { ...prev }
                  for (const it of items) {
                    if (stampFor(it)) continue
                    out[ckKey(it)] = next
                  }
                  return out
                })
              }
              function toggleOne(it) {
                if (stampFor(it)) return
                setItemChecks((prev) => ({ ...prev, [ckKey(it)]: !prev[ckKey(it)] }))
              }

              return (
                <div className="px-4 pb-4 pt-2">
                  {/* Back to timeline */}
                  <button
                    type="button"
                    onClick={() => setExpandedStopIndex(null)}
                    className="flex items-center gap-1.5 text-xs font-semibold mb-3"
                    style={{ color: 'var(--accent)' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    All stops
                  </button>

                  {/* Stop header */}
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm"
                      style={{
                        backgroundColor: isDone ? '#9ca3af' : stop.stopType === 'endpoint' ? '#7c3aed' : stop.stopType === 'pickup' ? '#16a34a' : '#dc2626',
                      }}
                    >
                      {isDone ? '✓' : stop.stopType === 'endpoint' ? 'E' : stopIndex + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                          style={{
                            color: stop.stopType === 'endpoint' ? '#7c3aed' : stop.stopType === 'pickup' ? '#16a34a' : '#dc2626',
                            backgroundColor: stop.stopType === 'endpoint' ? '#ede9fe' : stop.stopType === 'pickup' ? '#f0fdf4' : '#fff1f2',
                          }}
                        >
                          {stop.stopType === 'endpoint' ? 'End Point' : stop.stopType === 'pickup' ? 'Pickup' : 'Drop-off'}
                        </span>
                        {isActive && !isDone && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Current</span>
                        )}
                        {isDone && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Done</span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-gray-900 mt-1 leading-snug">{stop.address}</p>
                      {stop.estimatedArrivalAt && !isDone && (
                        <p className="text-xs text-blue-600 font-semibold mt-0.5">ETA {formatETA(stop.estimatedArrivalAt)}</p>
                      )}
                    </div>
                  </div>

                  {/* Contact info */}
                  {(stop.contactName || stop.contactPhone) && (
                    <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-3 flex items-center justify-between gap-4">
                      {stop.contactName && <span className="text-xs text-gray-600 font-medium">{stop.contactName}</span>}
                      {stop.contactPhone && (
                        <a href={`tel:${stop.contactPhone}`} className="text-xs text-blue-600 font-bold">
                          {stop.contactPhone}
                        </a>
                      )}
                    </div>
                  )}

                  {/* Notes */}
                  {stop.notes && (
                    <div className="bg-amber-50 rounded-2xl px-4 py-3 mb-3">
                      <p className="text-xs text-amber-700">{stop.notes}</p>
                    </div>
                  )}

                  {/* Items checklist */}
                  {stage && items.length > 0 && (
                    <div className="mb-4 rounded-2xl border border-gray-200 bg-white">
                      <label className="flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          onChange={(e) => toggleAll(e.target.checked)}
                          disabled={isDone || !isActive}
                          className="w-4 h-4 accent-green-600"
                        />
                        <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                          Items ({checkedCount}/{items.length})
                        </span>
                        <span className="ml-auto text-[10px] text-gray-400">Check all</span>
                      </label>
                      <ul className="divide-y divide-gray-100 max-h-44 overflow-y-auto">
                        {items.map((it) => {
                          const stamped = !!stampFor(it)
                          const checked = isChecked(it)
                          return (
                            <li key={it.itemId}>
                              <label className={`flex items-center gap-3 px-3 py-2 text-xs ${stamped || isDone || !isActive ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={stamped || isDone || !isActive}
                                  onChange={() => toggleOne(it)}
                                  className="w-4 h-4 accent-green-600"
                                />
                                <span className="shrink-0 inline-flex min-w-5.5 justify-center rounded-md bg-gray-100 text-gray-700 text-[10px] font-bold px-1.5 py-0.5">×{it.quantity}</span>
                                <span className={`truncate ${stamped ? 'line-through text-gray-400' : 'text-gray-800'}`}>{it.name}</span>
                                {it.type && <span className="text-[10px] text-gray-400 shrink-0">{it.type}</span>}
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}

                  {/* CTA — only for the active, non-completed stop */}
                  {isActive && !isDone && (
                    <>
                      <button
                        onClick={() => handleStopComplete(stop, stopIndex)}
                        disabled={!canConfirm}
                        className="w-full rounded-2xl py-3.5 text-sm font-bold shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: stop.stopType === 'endpoint' ? '#7c3aed' : stop.stopType === 'pickup' ? '#16a34a' : '#2563eb',
                          color: '#fff',
                        }}
                      >
                        {completing ? <Spinner size="sm" /> : stopActionLabel(stop)}
                      </button>

                      {(stop.stopType === 'pickup' || stop.stopType === 'dropoff') && (
                        <button
                          onClick={() => {
                            setFailureReason('')
                            setFailedModal({ stopIndex, stop })
                          }}
                          disabled={completing || submittingFailure}
                          className="w-full mt-2 rounded-2xl py-2.5 text-sm font-semibold border border-red-200 bg-white text-red-600 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {stop.stopType === 'pickup' ? 'Failed Pickup' : 'Failed Dropoff'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )
            })()
          ) : (
            /* ── ETA Timeline list ── */
            <div className="px-3 pt-2 pb-4">
              {/* Progress summary */}
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {activeStopIndex} of {stops.length} done
                </span>
                <div className="flex gap-1">
                  {stops.map((s, i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: i < activeStopIndex ? '#22c55e' : i === activeStopIndex ? '#2563eb' : '#e5e7eb',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Timeline rows */}
              <div className="relative">
                {stops.map((stop, i) => {
                  const isDone = !!stop.completedAt
                  const isActive = i === activeStopIndex
                  const isNext = !isDone && i > activeStopIndex
                  const eta = formatETA(stop.estimatedArrivalAt)
                  const isNew = newStopIds?.has(String(stop.bookingId))

                  const dotColor = isDone
                    ? '#22c55e'
                    : isActive
                      ? stop.stopType === 'endpoint' ? '#7c3aed' : '#2563eb'
                      : stop.stopType === 'endpoint' ? '#7c3aed' : stop.stopType === 'pickup' ? '#16a34a' : '#dc2626'

                  return (
                    <div key={i} className="relative flex gap-3 pb-1">
                      {/* Vertical line connecting stops */}
                      {i < stops.length - 1 && (
                        <div
                          className="absolute left-4 top-8 w-0.5 bottom-0"
                          style={{ backgroundColor: i < activeStopIndex ? '#22c55e' : '#e5e7eb', transform: 'translateX(-50%)' }}
                        />
                      )}

                      {/* Dot */}
                      <div className="shrink-0 flex flex-col items-center pt-1" style={{ width: '32px' }}>
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold shadow-sm border-2"
                          style={{
                            backgroundColor: dotColor,
                            borderColor: isActive ? dotColor : 'transparent',
                            boxShadow: isActive ? `0 0 0 3px ${dotColor}33` : undefined,
                            fontSize: isDone ? '16px' : '12px',
                          }}
                        >
                          {isDone ? '✓' : stop.stopType === 'endpoint' ? 'E' : i + 1}
                        </div>
                      </div>

                      {/* Row content — tappable */}
                      <button
                        type="button"
                        onClick={() => setExpandedStopIndex(i)}
                        className="flex-1 flex items-start justify-between gap-2 py-1.5 min-w-0 text-left"
                        style={{ paddingBottom: i < stops.length - 1 ? '12px' : '4px' }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                              style={{
                                color: stop.stopType === 'endpoint' ? '#7c3aed' : stop.stopType === 'pickup' ? '#16a34a' : '#dc2626',
                                backgroundColor: stop.stopType === 'endpoint' ? '#ede9fe' : stop.stopType === 'pickup' ? '#f0fdf4' : '#fff1f2',
                              }}
                            >
                              {stop.stopType === 'endpoint' ? 'End' : stop.stopType === 'pickup' ? 'Pickup' : 'Drop-off'}
                            </span>
                            {isNew && <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">NEW</span>}
                            {isActive && <span className="text-[9px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full">Now</span>}
                          </div>
                          <p
                            className="text-xs font-semibold mt-0.5 truncate"
                            style={{ color: isDone ? '#9ca3af' : '#111827', textDecoration: isDone ? 'line-through' : 'none' }}
                          >
                            {stop.address}
                          </p>
                          {stop.contactName && (
                            <p className="text-[10px] text-gray-400 truncate">{stop.contactName}</p>
                          )}
                        </div>
                        {/* ETA or done time */}
                        <div className="shrink-0 text-right">
                          {isDone ? (
                            <span className="text-[10px] text-green-600 font-semibold">Done</span>
                          ) : eta ? (
                            <span className={`text-[11px] font-bold ${isActive ? 'text-blue-600' : 'text-gray-500'}`}>{eta}</span>
                          ) : null}
                          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="mt-1 ml-auto">
                            <path d="M5 2l5 5-5 5" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Failed-stop reason modal */}
      {failedModal && (
        <div className="fixed inset-0 z-100 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-base font-bold" style={{ color: 'var(--fg-1)' }}>
                {failedModal.stop.stopType === 'pickup' ? 'Mark pickup failed' : 'Mark dropoff failed'}
              </h3>
              <button
                onClick={() => { setFailedModal(null); setFailureReason('') }}
                disabled={submittingFailure}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs" style={{ color: 'var(--fg-3)' }}>
                {failedModal.stop.address}
              </p>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--fg-2)' }}>
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={failureReason}
                  onChange={(e) => setFailureReason(e.target.value.slice(0, 500))}
                  placeholder="E.g. recipient not available, wrong address, package damaged…"
                  rows={4}
                  maxLength={500}
                  disabled={submittingFailure}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
                  style={{ color: 'var(--fg-1)' }}
                />
                <p className="text-[11px] mt-1" style={{ color: 'var(--fg-3)' }}>
                  {failureReason.length}/500 — admin will see this and can re-assign the booking.
                </p>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border flex gap-2 bg-slate-50">
              <button
                onClick={() => { setFailedModal(null); setFailureReason('') }}
                disabled={submittingFailure}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold border border-border bg-white hover:bg-slate-50 disabled:opacity-40"
                style={{ color: 'var(--fg-2)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleStopFailed}
                disabled={submittingFailure || !failureReason.trim()}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submittingFailure ? <Spinner size="sm" /> : 'Confirm Failure'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invisible helpers */}
      <VoiceGuide ref={voiceRef} />
      {driverId && (
        <RouteUpdater driverId={driverId} onRouteUpdate={handleRouteUpdate} />
      )}
    </div>
  )
}

