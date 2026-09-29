'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X, ChevronLeft, ChevronRight, Package } from 'lucide-react'
import Spinner from '@/components/ui/Spinner'
import Select from '@/components/ui/Select'
import BarChart from '@/components/ui/BarChart'
import { formatRelativeDayLabel, formatTime as formatTimeShared, formatDateTime } from '@/lib/dateFormat'

function formatDist(m) {
  if (!m) return null
  const km = m / 1000
  return km >= 0.1 ? `${km.toFixed(1)} km` : `${Math.round(m)} m`
}

function formatDur(s) {
  if (!s) return null
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m} min`
}

function formatDate(iso) {
  return formatRelativeDayLabel(iso)
}

function formatTime(iso) {
  return formatTimeShared(iso, { fallback: '' })
}

// Group bookings by date label
function groupByDate(bookings) {
  const groups = []
  const seen = {}
  for (const b of bookings) {
    const label = formatDate(b.updatedAt)
    if (!seen[label]) {
      seen[label] = { label, items: [] }
      groups.push(seen[label])
    }
    seen[label].items.push(b)
  }
  return groups
}

const HISTORY_RANGE_OPTIONS = [
  { value: '',      label: 'All time' },
  { value: 'day',   label: 'Today' },
  { value: 'week',  label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'year',  label: 'This Year' },
]
const HISTORY_PAGE_SIZE = 20

export default function DriverHistoryPage() {
  const router = useRouter()
  const [driverId, setDriverId]           = useState(null)
  const [stats, setStats]                 = useState(null)
  const [bookings, setBookings]           = useState([])
  const [total, setTotal]                 = useState(0)
  const [page, setPage]                   = useState(1)
  const [historyRange, setHistoryRange]   = useState('')
  const [loading, setLoading]             = useState(true)
  const [distanceRange, setDistanceRange] = useState('month')
  const [distance, setDistance]           = useState(null)
  const [distanceLoading, setDistanceLoading] = useState(true)
  const [selectedBookingId, setSelectedBookingId] = useState(null)

  const loadMe = useCallback(async () => {
    const meRes = await fetch('/api/auth/me', { cache: 'no-store' })
    if (!meRes.ok) { router.replace('/login'); return null }
    const me = await meRes.json()
    setDriverId(me.userId)
    return me.userId
  }, [router])

  useEffect(() => { loadMe() }, [loadMe])

  useEffect(() => {
    if (!driverId) return
    fetch(`/api/drivers/${driverId}/stats?t=${Date.now()}`, { cache: 'no-store' })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data) setStats(data) })
  }, [driverId])

  // Booking list — paginated + range-filtered server-side so switching a
  // filter or page never has to hold the driver's ENTIRE delivery history in
  // memory client-side (the old version fetched everything unpaginated).
  const loadBookings = useCallback(async () => {
    if (!driverId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        statusGroup: 'completed',
        page: String(page),
        pageSize: String(HISTORY_PAGE_SIZE),
        t: String(Date.now()),
      })
      if (historyRange) params.set('range', historyRange)

      const res = await fetch(`/api/drivers/${driverId}/bookings?${params}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setBookings(Array.isArray(data.bookings) ? data.bookings : [])
        setTotal(data.total ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }, [driverId, page, historyRange])

  useEffect(() => { loadBookings() }, [loadBookings])

  useEffect(() => {
    function onVisible() { if (document.visibilityState === 'visible') loadBookings() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadBookings])

  // Changing the range filter always starts back at page 1 — a stale page
  // number from a wider filter could point past the end of a narrower one.
  function handleRangeChange(range) {
    setHistoryRange(range)
    setPage(1)
  }

  // Km-driven / estimated-hours cards — fetched separately from the booking
  // list so switching either range filter only re-fetches its own data.
  const loadDistance = useCallback(async () => {
    if (!driverId) return
    setDistanceLoading(true)
    try {
      const res = await fetch(`/api/drivers/${driverId}/distance?range=${distanceRange}&t=${Date.now()}`, { cache: 'no-store' })
      if (res.ok) setDistance(await res.json())
    } finally {
      setDistanceLoading(false)
    }
  }, [driverId, distanceRange])

  useEffect(() => { loadDistance() }, [loadDistance])

  const groups = groupByDate(bookings)
  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE))

  return (
    <div className="flex-1 bg-[#f5f5f7] pb-6">

      {/* Header */}
      <div className="bg-white px-5 pt-4 pb-5 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">Delivery History</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          {stats?.completedTotal ?? 0} total delivered · {stats?.completedToday ?? 0} today
        </p>

        {/* Summary chips */}
        {stats && (
          <div className="mt-4 flex gap-2 flex-wrap">
            <SummaryChip icon="✅" label="Total" value={stats.completedTotal} color="#22c55e" bg="#f0fdf4" />
            <SummaryChip icon="📅" label="Today"  value={stats.completedToday} color="#3b82f6" bg="#eff6ff" />
          </div>
        )}
      </div>

      {/* Km driven */}
      <div className="px-4 pt-5">
        <DistanceCard
          distance={distance}
          loading={distanceLoading}
          range={distanceRange}
          onRangeChange={setDistanceRange}
        />
      </div>

      {/* Estimated route hours */}
      <div className="px-4 pt-4">
        <EstimatedHoursCard
          distance={distance}
          loading={distanceLoading}
          range={distanceRange}
          onRangeChange={setDistanceRange}
        />
      </div>

      {/* Range filter chips for the booking list below */}
      <div className="px-4 pt-5">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {HISTORY_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value || 'all'}
              onClick={() => handleRangeChange(opt.value)}
              className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors"
              style={{
                background: historyRange === opt.value ? '#111827' : '#fff',
                color:      historyRange === opt.value ? '#fff' : '#6b7280',
                border: '1px solid ' + (historyRange === opt.value ? '#111827' : '#e5e7eb'),
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="mx-4 mt-6 bg-white rounded-3xl px-5 py-12 text-center shadow-sm">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-3xl mx-auto mb-3">
            📭
          </div>
          <p className="text-base font-bold text-gray-800">No deliveries yet</p>
          <p className="text-xs text-gray-400 mt-1">
            {historyRange ? 'Try a different date range.' : 'Completed deliveries will appear here.'}
          </p>
        </div>
      ) : (
        <>
          <div className="px-4 pt-5 space-y-5 pb-4">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
                  {group.label}
                </p>
                <div className="space-y-3">
                  {group.items.map((b) => (
                    <DeliveredCard key={b._id} booking={b} onViewDetail={() => setSelectedBookingId(b._id)} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <HistoryPagination page={page} totalPages={totalPages} total={total} onNavigate={setPage} />
        </>
      )}

      {selectedBookingId && (
        <BookingDetailModal bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />
      )}
    </div>
  )
}

function HistoryPagination({ page, totalPages, total, onNavigate }) {
  if (totalPages <= 1) return null
  return (
    <div className="px-4 pb-2 flex items-center justify-between gap-3">
      <span className="text-[11px] text-gray-400">Page {page} of {totalPages} · {total} total</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onNavigate(page - 1)}
          disabled={page <= 1}
          className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          onClick={() => onNavigate(page + 1)}
          disabled={page >= totalPages}
          className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center text-gray-500 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  )
}

function DeliveredCard({ booking: b, onViewDetail }) {
  const pickup  = b.stops?.find((s) => s.type === 'pickup')
  const dropoff = b.stops?.find((s) => s.type === 'dropoff')

  return (
    <div className="bg-white rounded-2xl px-4 py-4 shadow-sm">
      {/* Top row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          <span className="text-[11px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
            Delivered
          </span>
        </div>
        <span className="text-[11px] text-gray-400">{formatTime(b.updatedAt)}</span>
      </div>

      {/* Route */}
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center pt-1 gap-0.5">
          <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
          <div className="w-px h-4 bg-gray-200" />
          <div className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="text-xs font-semibold text-gray-800 truncate">{pickup?.address ?? '—'}</p>
          <p className="text-xs text-gray-400 truncate">{dropoff?.address ?? '—'}</p>
        </div>
      </div>

      {/* Chips */}
      {(b.estimatedDistanceMeters || b.estimatedDurationSeconds) && (
        <div className="flex gap-2 mt-3 flex-wrap">
          {b.estimatedDistanceMeters && (
            <span className="text-[11px] text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
              📍 {formatDist(b.estimatedDistanceMeters)}
            </span>
          )}
          {b.estimatedDurationSeconds && (
            <span className="text-[11px] text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
              ⏱ {formatDur(b.estimatedDurationSeconds)}
            </span>
          )}
        </div>
      )}

      <button
        onClick={onViewDetail}
        className="w-full mt-3 pt-3 border-t border-gray-100 text-xs font-semibold text-blue-600 text-center"
      >
        View detail
      </button>
    </div>
  )
}

// Clearly-labeled note badges for one stop — matches the amber-box styling
// already used for the customer's note on the active route page
// (route/page.js), extended here with the driver's own per-stop note
// (stop.driverNote) so a driver reviewing history can see what they wrote,
// not just what the customer wrote. Distinct from the shared token-based
// StopNotes component used on admin/customer pages — the driver portal uses
// its own plain-Tailwind palette throughout, not CSS variable tokens.
function StopNoteBadges({ stop }) {
  if (!stop?.notes && !stop?.driverNote) return null
  return (
    <div className="mt-1 space-y-1">
      {stop.notes && (
        <p className="text-xs text-gray-600 bg-gray-100 rounded-lg px-2 py-1 inline-block">
          <span className="font-semibold">Customer note:</span> {stop.notes}
        </p>
      )}
      {stop.driverNote && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1 inline-block">
          <span className="font-semibold">Driver note:</span> {stop.driverNote}
        </p>
      )}
    </div>
  )
}

// Fetches full booking detail on demand (only when a card's "View detail" is
// tapped) via the existing GET /api/bookings/[bookingId] — already scoped to
// the calling driver's own assigned bookings (findBookingById driverId
// filter), so no new endpoint was needed for this.
function BookingDetailModal({ bookingId, onClose }) {
  const [booking, setBooking] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/bookings/${bookingId}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Could not load booking')
        return res.json()
      })
      .then((data) => { if (!cancelled) setBooking(data) })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [bookingId])

  const pickup  = booking?.stops?.find((s) => s.type === 'pickup')
  const dropoff = booking?.stops?.find((s) => s.type === 'dropoff')
  const pkg     = booking?.packageDetails
  const packages = Array.isArray(pkg?.packages) && pkg.packages.length > 0 ? pkg.packages : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Booking Detail</h2>
          <button onClick={onClose} className="p-1.5 rounded-full text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="md" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-500 text-center py-8">{error}</p>
          ) : booking ? (
            <div className="space-y-5">
              {/* Status + tracking */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-full capitalize">
                  {booking.status?.replace(/_/g, ' ')}
                </span>
                <span className="text-[11px] text-gray-400">{booking.trackingToken}</span>
              </div>

              {/* Route */}
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Route</p>
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center pt-1 gap-0.5">
                    <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                    <div className="w-px h-8 bg-gray-200" />
                    <div className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{pickup?.address ?? '—'}</p>
                      {pickup?.contactName && <p className="text-xs text-gray-400 mt-0.5">{pickup.contactName} · {pickup.contactPhone}</p>}
                      <StopNoteBadges stop={pickup} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{dropoff?.address ?? '—'}</p>
                      {dropoff?.contactName && <p className="text-xs text-gray-400 mt-0.5">{dropoff.contactName} · {dropoff.contactPhone}</p>}
                      <StopNoteBadges stop={dropoff} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Package details */}
              {pkg && (
                <div>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Package size={11} /> Package
                  </p>
                  {packages ? (
                    <ul className="space-y-1.5">
                      {packages.map((p, i) => (
                        <li key={p.itemId ?? i} className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
                          <span className="shrink-0 inline-flex min-w-5 justify-center rounded-md bg-gray-200 text-gray-600 text-[10px] font-bold px-1.5 py-0.5">{i + 1}</span>
                          <span className="truncate">{p.kind || 'Package'}{p.quantity > 1 ? ` ×${p.quantity}` : ''}</span>
                          {p.weightLbs > 0 && <span className="ml-auto text-xs text-gray-400 shrink-0">{p.weightLbs} lbs</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-sm text-gray-700">
                      <span>{pkg.kind || 'Package'}</span>
                      {pkg.weightLbs > 0 && <span className="text-gray-400"> · {pkg.weightLbs} lbs</span>}
                    </div>
                  )}
                </div>
              )}

              {/* Trip stats */}
              {(booking.estimatedDistanceMeters || booking.estimatedDurationSeconds || booking.estimatedPrice != null) && (
                <div>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Trip</p>
                  <div className="flex gap-2 flex-wrap">
                    {booking.estimatedDistanceMeters > 0 && (
                      <span className="text-[11px] text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                        📍 {formatDist(booking.estimatedDistanceMeters)}
                      </span>
                    )}
                    {booking.estimatedDurationSeconds > 0 && (
                      <span className="text-[11px] text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                        ⏱ {formatDur(booking.estimatedDurationSeconds)}
                      </span>
                    )}
                    {booking.estimatedPrice != null && (
                      <span className="text-[11px] text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                        ${Number(booking.estimatedPrice).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="text-[11px] text-gray-400 space-y-0.5 pt-2 border-t border-gray-100">
                <p>Created: {formatDateTime(booking.createdAt)}</p>
                <p>Last updated: {formatDateTime(booking.updatedAt)}</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function SummaryChip({ icon, label, value, color, bg }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ backgroundColor: bg }}>
      <span>{icon}</span>
      <span className="text-xs font-semibold" style={{ color }}>{value} {label}</span>
    </div>
  )
}

const DISTANCE_RANGE_OPTIONS = [
  { value: 'day',   label: 'Today' },
  { value: 'week',  label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'year',  label: 'This Year' },
]
const DISTANCE_RANGE_UNIT_LABEL = {
  day: 'today',
  week: 'this week',
  month: 'this month',
  year: 'this year',
}
const DISTANCE_COLOR = '#2563eb'

// Km-driven card — mirrors the admin driver-detail page's distance chart
// (same range options, same underlying /distance data shape) so a driver can
// see their own km driven with the same day/week/month/year filters admin has.
function DistanceCard({ distance, loading, range, onRangeChange }) {
  const series = distance?.distanceSeries ?? []
  const chartData = series.map((s) => ({ label: s.label, km: s.meters / 1000 }))
  const totalKm = (distance?.distanceRangeMeters ?? 0) / 1000
  const allTimeKm = (distance?.totalDistanceDrivenMeters ?? 0) / 1000
  const rangeLabel = DISTANCE_RANGE_OPTIONS.find((o) => o.value === range)?.label ?? 'This Month'

  return (
    <div className="bg-white rounded-2xl px-4 py-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-bold text-gray-900">Km Driven</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{allTimeKm.toFixed(1)} km all-time</p>
        </div>
        <div className="shrink-0" style={{ width: '132px' }}>
          <Select value={range} onChange={onRangeChange} options={DISTANCE_RANGE_OPTIONS} />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="sm" />
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5 mb-1">
            <span className="text-2xl font-black" style={{ color: DISTANCE_COLOR }}>{totalKm.toFixed(1)}</span>
            <span className="text-xs font-semibold text-gray-400">
              km {DISTANCE_RANGE_UNIT_LABEL[range] ?? 'this month'}
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mb-3">
            {rangeLabel} — per {range === 'day' ? 'hour' : range === 'year' ? 'month' : 'day'}
          </p>
          <BarChart
            data={chartData}
            height={110}
            color={DISTANCE_COLOR}
            getValue={(d) => d.km}
            tooltip={(v) => `${v.toFixed(1)} km`}
          />
        </>
      )}
    </div>
  )
}

const HOURS_COLOR = '#f59e0b'

// Estimated-hours card — same range state/data source as DistanceCard (one
// /distance fetch already returns both), showing ORS's one-time planned-route
// duration estimate summed per bucket. A rough estimate, not measured time
// actually worked — see getDriverEstimatedHoursForRange's doc comment.
function EstimatedHoursCard({ distance, loading, range, onRangeChange }) {
  const series = distance?.estimatedHoursSeries ?? []
  const chartData = series.map((s) => ({ label: s.label, hours: s.seconds / 3600 }))
  const totalHours = (distance?.estimatedHoursRangeSeconds ?? 0) / 3600
  const rangeLabel = DISTANCE_RANGE_OPTIONS.find((o) => o.value === range)?.label ?? 'This Month'

  return (
    <div className="bg-white rounded-2xl px-4 py-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-bold text-gray-900">Estimated Hours</p>
          <p className="text-[11px] text-gray-400 mt-0.5">rough route-time estimate</p>
        </div>
        <div className="shrink-0" style={{ width: '132px' }}>
          <Select value={range} onChange={onRangeChange} options={DISTANCE_RANGE_OPTIONS} />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="sm" />
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5 mb-1">
            <span className="text-2xl font-black" style={{ color: HOURS_COLOR }}>{totalHours.toFixed(1)}</span>
            <span className="text-xs font-semibold text-gray-400">
              hrs (est.) {DISTANCE_RANGE_UNIT_LABEL[range] ?? 'this month'}
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mb-3">
            {rangeLabel} — per {range === 'day' ? 'hour' : range === 'year' ? 'month' : 'day'}
          </p>
          <BarChart
            data={chartData}
            height={110}
            color={HOURS_COLOR}
            getValue={(d) => d.hours}
            tooltip={(v) => `${v.toFixed(1)} hrs (est.)`}
          />
        </>
      )}
    </div>
  )
}
