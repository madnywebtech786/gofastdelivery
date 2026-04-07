'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import Spinner from '@/components/ui/Spinner'
import RouteUpdater from '@/components/realtime/RouteUpdater'
import VoiceGuide from '@/components/driver/VoiceGuide'


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
  if (stop.stopType === 'pickup') return 'Confirm Pickup'
  return 'Confirm Delivery'
}

export default function DriverRoutePage() {
  const router = useRouter()
  const voiceRef    = useRef(null)
  const routeRef    = useRef(null)
  const [driverId, setDriverId] = useState(null)
  const [route, setRoute] = useState(null)
  const [driverPos, setDriverPos] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sheetOpen, setSheetOpen] = useState(true)
  const [activeStopIndex, setActiveStopIndex] = useState(0)
  const [completing, setCompleting] = useState(false)
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

      // If we have the driver's GPS position, re-optimize from their current location.
      // This ensures stop 1 is always the nearest stop, not the first-created one.
      if (posResult) {
        try {
          const rerouteRes = await fetch(`/api/drivers/${me.userId}/reroute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentLng: posResult.lng, currentLat: posResult.lat }),
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
    } catch (err) {
      setError(err.message || 'Failed to load route')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadRoute() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRouteUpdate = useCallback((newRoute) => {
    // Only accept a Pusher route:updated payload if it came from the worker
    // (i.e. it has optimizedStops). Ignore booking status change events on the
    // driver channel — those don't carry route data and would overwrite local state.
    if (!newRoute?.optimizedStops) return

    const prevPhase = routeRef.current?.routePhase ?? 'pickup'
    routeRef.current = newRoute
    setRoute(newRoute)

    // Re-sync activeStopIndex from the new route so completed stops stay completed
    const resumeIndex = (newRoute.optimizedStops ?? []).findIndex((s) => !s.completedAt)
    if (resumeIndex === -1) {
      // All stops in new route are also done — keep at end
      setActiveStopIndex(newRoute.optimizedStops.length)
    } else {
      setActiveStopIndex(resumeIndex)
    }

    const phase = newRoute.routePhase ?? 'pickup'
    const wasPickup = prevPhase === 'pickup'
    if (phase === 'dropoff' && wasPickup) {
      voiceRef.current?.speak('All packages collected. Starting delivery run. Follow the new route.')
    } else {
      voiceRef.current?.speak('Route updated. Follow the new directions.')
    }
  }, [])

  async function handleStopComplete(stop, stopIndex) {
    if (!driverId || completing) return
    setCompleting(true)
    try {
      // Pass current GPS position so server can optimize dropoffs from driver's location
      // when last pickup is confirmed (phase transition)
      const pos = driverPos
      const res = await fetch(`/api/drivers/${driverId}/stop-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stopIndex,
          currentLng: pos?.lng ?? null,
          currentLat: pos?.lat ?? null,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        console.error('[stop-complete] failed:', data.error)
        return
      }

      const { route: updatedRoute } = await res.json()

      if (updatedRoute) {
        routeRef.current = updatedRoute
        setRoute(updatedRoute)
        // Derive next index from server data — more reliable than stopIndex + 1
        const allStops = updatedRoute.optimizedStops ?? []
        const nextIndex = allStops.findIndex((s) => !s.completedAt)
        const resolvedNext = nextIndex === -1 ? allStops.length : nextIndex
        setActiveStopIndex(resolvedNext)

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

  function handleGoHome() {
    router.push('/home')
  }

  async function handleSignOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/login')
  }

  // ── Loading state ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen" style={{ background: 'var(--bg)' }}>
        <Spinner size="lg" />
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

      {/* Top overlay — back + sign out */}
      <div className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-3 pt-3 pointer-events-none">
        <button
          onClick={() => handleGoHome()}
          className="pointer-events-auto bg-white shadow-md rounded-full w-10 h-10 flex items-center justify-center text-gray-700 text-lg active:bg-gray-100"
        >
          ←
        </button>
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
                  style={{ backgroundColor: currentStop.stopType === 'pickup' ? '#22c55e' : '#dc2626' }}
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
            {/* Up arrow SVG */}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 9L7 4L12 9" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </button>

        {/* ── Expandable content — 45vh so it never covers the full map ── */}
        <div
          className="bg-white overflow-y-auto transition-all duration-300 ease-out"
          style={{
            maxHeight: sheetOpen ? '45vh' : '0px',
            paddingBottom: sheetOpen ? 'env(safe-area-inset-bottom)' : '0px',
          }}
        >
          <div className="px-4 pb-6 pt-2">
            {allDone ? (
              <div className="text-center py-6">
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
            ) : stops.length === 0 && routePhase === 'pickup' ? (
              // Edge case: route loaded but no stops yet (shouldn't happen normally)
              null
            ) : currentStop ? (
              <>
                {/* Phase banner */}
                <div
                  className="rounded-xl px-3 py-2 mb-3 flex items-center gap-2"
                  style={{
                    backgroundColor: routePhase === 'pickup' ? '#f0fdf4' : '#eff6ff',
                    borderLeft: `3px solid ${routePhase === 'pickup' ? '#16a34a' : '#2563eb'}`,
                  }}
                >
                  <span className="text-sm font-bold" style={{ color: routePhase === 'pickup' ? '#16a34a' : '#2563eb' }}>
                    {routePhase === 'pickup' ? 'P' : 'D'}
                  </span>
                  <div>
                    <p className="text-xs font-bold" style={{ color: routePhase === 'pickup' ? '#15803d' : '#1d4ed8' }}>
                      {routePhase === 'pickup' ? 'Pickup Run' : 'Delivery Run'}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {routePhase === 'pickup'
                        ? `Collect all packages · ${pendingDropoffCount} drop-off${pendingDropoffCount !== 1 ? 's' : ''} queued after`
                        : 'Deliver all packages to recipients'}
                    </p>
                  </div>
                </div>

                {/* Progress dots */}
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Stop {activeStopIndex + 1} of {stops.length}
                  </span>
                  <div className="flex gap-1.5">
                    {stops.map((s, i) => (
                      <div
                        key={i}
                        className="w-2 h-2 rounded-full transition-colors"
                        style={{
                          backgroundColor:
                            i < activeStopIndex ? '#22c55e'
                            : i === activeStopIndex ? '#2563eb'
                            : '#e5e7eb',
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Stop type badge + address */}
                <div className="flex items-start gap-3 mb-4">
                  <div
                    className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm"
                    style={{ backgroundColor: currentStop.stopType === 'pickup' ? '#16a34a' : '#dc2626' }}
                  >
                    {activeStopIndex + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{
                        color: currentStop.stopType === 'pickup' ? '#16a34a' : '#dc2626',
                        backgroundColor: currentStop.stopType === 'pickup' ? '#f0fdf4' : '#fff1f2',
                      }}
                    >
                      {currentStop.stopType === 'pickup' ? 'Pickup' : 'Drop-off'}
                    </span>
                    <p className="text-sm font-semibold text-gray-900 mt-1 leading-snug">{currentStop.address}</p>
                  </div>
                </div>

                {/* Contact info */}
                {(currentStop.contactName || currentStop.contactPhone) && (
                  <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-3 flex items-center justify-between gap-4">
                    {currentStop.contactName && (
                      <span className="text-xs text-gray-600 font-medium">{currentStop.contactName}</span>
                    )}
                    {currentStop.contactPhone && (
                      <a
                        href={`tel:${currentStop.contactPhone}`}
                        className="text-xs text-blue-600 font-bold flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {currentStop.contactPhone}
                      </a>
                    )}
                  </div>
                )}

                {/* Notes */}
                {currentStop.notes && (
                  <div className="bg-amber-50 rounded-2xl px-4 py-3 mb-3">
                    <p className="text-xs text-amber-700">{currentStop.notes}</p>
                  </div>
                )}

                {/* Upcoming stops preview */}
                {stops.length > activeStopIndex + 1 && (
                  <div className="mb-4 space-y-1.5">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Next stops</p>
                    {stops.slice(activeStopIndex + 1, activeStopIndex + 3).map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: s.stopType === 'pickup' ? '#22c55e' : '#dc2626' }}
                        />
                        <p className="text-xs text-gray-400 truncate">{s.address}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* CTA — label changes by stop type */}
                <button
                  onClick={() => handleStopComplete(currentStop, activeStopIndex)}
                  disabled={completing}
                  className="w-full rounded-2xl py-3.5 text-sm font-bold shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{
                    backgroundColor: currentStop.stopType === 'pickup' ? '#16a34a' : '#2563eb',
                    color: '#fff',
                  }}
                >
                  {completing ? (
                    <Spinner size="sm" />
                  ) : (
                    <>
                      {stopActionLabel(currentStop)}
                    </>
                  )}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* Invisible helpers */}
      <VoiceGuide ref={voiceRef} />
      {driverId && (
        <RouteUpdater driverId={driverId} onRouteUpdate={handleRouteUpdate} />
      )}
    </div>
  )
}

