'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import {
  MapPin, Clock, ChevronRight, UserCheck, AlertCircle, Truck,
  Package, PackageCheck, CheckCircle2, ArrowRight, Search, X,
  Users, Zap, Circle, Navigation, ChevronLeft,
} from 'lucide-react'

const PAGE_SIZE = 5

function Pagination({ page, total, onChange }) {
  const totalPages = Math.ceil(total / PAGE_SIZE)
  if (totalPages <= 1) return null

  // Build page numbers with ellipsis
  function pages() {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const arr = []
    arr.push(1)
    if (page > 3)           arr.push('…')
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) arr.push(i)
    if (page < totalPages - 2) arr.push('…')
    arr.push(totalPages)
    return arr
  }

  return (
    <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border"
      style={{ background: 'var(--surface-2)' }}>
      <span className="text-xs" style={{ color: 'var(--fg-3)' }}>
        {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-(--surface-3)"
          style={{ color: 'var(--fg-2)' }}
        >
          <ChevronLeft size={13} />
        </button>
        {pages().map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="w-7 h-7 flex items-center justify-center text-xs" style={{ color: 'var(--fg-3)' }}>…</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              className="w-7 h-7 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: page === p ? 'var(--accent)' : 'transparent',
                color:      page === p ? '#fff' : 'var(--fg-2)',
              }}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-(--surface-3)"
          style={{ color: 'var(--fg-2)' }}
        >
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-PK', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function formatTimeAgo(d) {
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const TAB_META = {
  pickup:   { label: 'Pending Pickup',       icon: Package,      color: '#d97706', bg: 'rgba(217,119,6,0.08)',   desc: 'Awaiting driver assignment' },
  delivery: { label: 'Ready for Delivery',   icon: Navigation,   color: '#2563eb', bg: 'rgba(37,99,235,0.08)',   desc: 'Picked up, needs delivery driver' },
  assigned: { label: 'In Progress',          icon: Truck,        color: '#16a34a', bg: 'rgba(22,163,74,0.08)',   desc: 'Currently assigned to drivers' },
}

export default function AdminBookingsClient({ initialTab, pendingBookings, pickedUpBookings, assignedBookings }) {
  const router = useRouter()
  const toast  = useToast()
  const [tab, setTab]           = useState(initialTab)
  const [selected, setSelected] = useState(new Set())
  const [drivers, setDrivers]   = useState([])
  const [driverId, setDriverId] = useState('')
  const [loadingDrivers, setLoadingDrivers] = useState(true)
  const [isPending, startTransition]        = useTransition()
  const [assigning, setAssigning] = useState(false)
  const [error, setError]         = useState('')
  const [search, setSearch]       = useState('')
  const [bookingPage, setBookingPage]   = useState(1)
  const [assignedPage, setAssignedPage] = useState(1)

  const assignableBookings = tab === 'pickup' ? pendingBookings : pickedUpBookings
  const isAssignedTab = tab === 'assigned'
  const tabCounts = {
    pickup:   pendingBookings.length,
    delivery: pickedUpBookings.length,
    assigned: assignedBookings.length,
  }

  useEffect(() => {
    fetch('/api/drivers')
      .then((r) => r.json())
      .then((data) => setDrivers(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadingDrivers(false))
  }, [])

  function switchTab(next) { setTab(next); setSelected(new Set()); setError(''); setSearch(''); setBookingPage(1); setAssignedPage(1) }
  function toggleSelect(id) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    const filtered = filteredBookings
    setSelected(selected.size === filtered.length && filtered.length > 0 ? new Set() : new Set(filtered.map((b) => b._id)))
  }

  const filteredBookings = search.trim()
    ? assignableBookings.filter((b) => b.stops?.some((s) => s.address?.toLowerCase().includes(search.toLowerCase())))
    : assignableBookings

  const filteredAssigned = search.trim()
    ? assignedBookings.filter((b) => b.stops?.some((s) => s.address?.toLowerCase().includes(search.toLowerCase())))
    : assignedBookings

  const pagedBookings = filteredBookings.slice((bookingPage - 1) * PAGE_SIZE, bookingPage * PAGE_SIZE)
  const pagedAssigned = filteredAssigned.slice((assignedPage - 1) * PAGE_SIZE, assignedPage * PAGE_SIZE)

  function handleSearchChange(val) { setSearch(val); setBookingPage(1); setAssignedPage(1) }

  async function handleAssign() {
    if (selected.size === 0) { setError('Select at least one booking.'); return }
    if (!driverId) { setError('Choose a driver first.'); return }
    setError(''); setAssigning(true)
    try {
      const res = await fetch('/api/bookings/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingIds: Array.from(selected), driverId, assignmentType: tab === 'pickup' ? 'pickup' : 'delivery' }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Assignment failed.'); return }
      const msg = data.merged
        ? `${data.assigned} booking${data.assigned > 1 ? 's' : ''} merged into driver's route.`
        : `${data.assigned} booking${data.assigned > 1 ? 's' : ''} assigned successfully.`
      toast.success('Assignment complete', msg)
      setSelected(new Set()); setDriverId('')
      startTransition(() => router.refresh())
    } catch { setError('Network error. Please try again.') }
    finally { setAssigning(false) }
  }

  const selectedDriver = drivers.find((d) => d._id === driverId)
  const driverOptions  = drivers.map((d) => ({
    value: d._id,
    label: d.name,
    meta: d.pendingStopCount > 0 ? `${d.pendingStopCount} active stops` : '',
  }))
  function driverName(id) { return drivers.find((x) => x._id === id)?.name ?? '—' }

  const currentMeta = TAB_META[tab]
  const TIcon = currentMeta.icon

  return (
    <div className="space-y-6">

      {/* ── Page Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 anim-fade-up">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>Bookings</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--fg-3)' }}>Manage dispatch — assign drivers to pickups and deliveries</p>
        </div>
        {/* Total badge */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-white"
            style={{ color: 'var(--fg-2)' }}>
            {pendingBookings.length + pickedUpBookings.length + assignedBookings.length} total
          </span>
        </div>
      </div>

      {/* ── Tab Strip ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 anim-fade-up s1">
        {Object.entries(TAB_META).map(([key, meta]) => {
          const count  = tabCounts[key]
          const active = tab === key
          const Icon   = meta.icon
          return (
            <button
              key={key}
              onClick={() => switchTab(key)}
              className="relative flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-2xl border transition-all duration-200 text-left group overflow-hidden"
              style={{
                background:   active ? meta.bg  : 'white',
                borderColor:  active ? meta.color : 'var(--border)',
                boxShadow:    active ? `0 0 0 1px ${meta.color}40` : 'none',
              }}
            >
              {/* Active indicator line */}
              {active && (
                <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl"
                  style={{ background: meta.color }} />
              )}
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: active ? meta.color : meta.bg, color: active ? 'white' : meta.color }}>
                <Icon size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold leading-tight truncate"
                  style={{ color: active ? meta.color : 'var(--fg)' }}>
                  {meta.label}
                </p>
                <p className="text-xs mt-0.5 hidden sm:block" style={{ color: 'var(--fg-3)' }}>
                  {meta.desc}
                </p>
              </div>
              <span
                className="text-lg font-black mono shrink-0"
                style={{ color: active ? meta.color : 'var(--fg-3)' }}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Search bar ──────────────────────────────────────────────── */}
      <div className="relative anim-fade-up s2">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--fg-3)' }} />
        <input
          type="text"
          placeholder={`Search ${currentMeta.label.toLowerCase()} by address…`}
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-all"
          style={{ '--tw-ring-color': 'var(--accent-glow)', color: 'var(--fg)' }}
        />
        {search && (
          <button className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-70"
            style={{ color: 'var(--fg-3)' }} onClick={() => handleSearchChange('')}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* ── Assigned (read-only) tab ─────────────────────────────────── */}
      {isAssignedTab && (
        <div className="bg-white rounded-2xl border border-border overflow-hidden anim-fade-up s3">
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between"
            style={{ background: 'var(--surface-2)' }}>
            <div className="flex items-center gap-2">
              <Truck size={14} style={{ color: 'var(--fg-3)' }} />
              <span className="text-sm font-bold" style={{ color: 'var(--fg)' }}>
                {filteredAssigned.length} Booking{filteredAssigned.length !== 1 ? 's' : ''} In Progress
              </span>
            </div>
          </div>

          {filteredAssigned.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: 'var(--surface-2)' }}>
                <PackageCheck size={28} style={{ color: 'var(--fg-3)' }} />
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--fg-2)' }}>No in-progress bookings</p>
              <p className="text-xs mt-1" style={{ color: 'var(--fg-3)' }}>Assigned bookings will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {pagedAssigned.map((b, i) => {
                const pickup  = b.stops?.find((s) => s.type === 'pickup')
                const dropoff = b.stops?.find((s) => s.type === 'dropoff')
                const driver  = !loadingDrivers ? driverName(b.assignedDriverId) : null
                return (
                  <Link
                    key={b._id}
                    href={`/bookings/${b._id}`}
                    className={`flex items-start gap-4 px-5 py-4 hover:bg-(--surface-2) transition-colors group anim-fade-up s${Math.min(i + 1, 6)}`}
                  >
                    {/* Status dot */}
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                      style={{
                        background: b.status === 'assigned_pickup' ? 'rgba(37,99,235,0.08)' : 'rgba(22,163,74,0.08)',
                        color:      b.status === 'assigned_pickup' ? '#2563eb' : '#16a34a',
                      }}>
                      {b.status === 'assigned_pickup' ? <Package size={16} /> : <Navigation size={16} />}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Top row */}
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <Badge status={b.status} />
                        {driver && (
                          <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                            style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                            <UserCheck size={10} />{driver}
                          </span>
                        )}
                        <span className="text-xs ml-auto" style={{ color: 'var(--fg-3)' }}>
                          {formatTimeAgo(b.updatedAt)}
                        </span>
                      </div>

                      {/* Route */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <MapPin size={11} style={{ color: 'var(--success)', flexShrink: 0 }} />
                          <p className="text-sm font-semibold truncate" style={{ color: 'var(--fg)' }}>
                            {pickup?.address ?? '—'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin size={11} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                          <p className="text-sm truncate" style={{ color: 'var(--fg-3)' }}>
                            {dropoff?.address ?? '—'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <ArrowRight size={14} className="shrink-0 mt-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
                      style={{ color: 'var(--accent)' }} />
                  </Link>
                )
              })}
            </div>
          )}
          <Pagination page={assignedPage} total={filteredAssigned.length} onChange={setAssignedPage} />
        </div>
      )}

      {/* ── Pickup / Delivery assignable tabs ───────────────────────── */}
      {!isAssignedTab && (
        <div className="grid xl:grid-cols-[1fr_360px] gap-5 items-start anim-fade-up s3">

          {/* ── Booking list ──────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-border overflow-hidden">

            {/* List header */}
            <div className="px-5 py-3.5 border-b border-border flex items-center gap-3"
              style={{ background: 'var(--surface-2)' }}>
              <label className="flex items-center gap-3 cursor-pointer flex-1">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={selected.size === filteredBookings.length && filteredBookings.length > 0}
                    ref={(el) => {
                      if (el) el.indeterminate = selected.size > 0 && selected.size < filteredBookings.length
                    }}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded cursor-pointer accent-accent"
                  />
                </div>
                <span className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>
                  {selected.size > 0
                    ? <span style={{ color: 'var(--accent)' }}>{selected.size} selected</span>
                    : <span>{filteredBookings.length} booking{filteredBookings.length !== 1 ? 's' : ''}</span>
                  }
                </span>
              </label>
              {selected.size > 0 && (
                <button onClick={() => setSelected(new Set())}
                  className="text-xs font-medium transition-colors hover:underline"
                  style={{ color: 'var(--fg-3)' }}>
                  Clear
                </button>
              )}
            </div>

            {/* Empty state */}
            {filteredBookings.length === 0 ? (
              <div className="py-20 text-center">
                <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                  style={{ background: 'var(--surface-2)' }}>
                  <TIcon size={28} style={{ color: 'var(--fg-3)' }} />
                </div>
                <p className="text-sm font-medium" style={{ color: 'var(--fg-2)' }}>
                  {search ? 'No bookings match your search' : tab === 'pickup' ? 'No pending bookings' : 'No packages ready for delivery'}
                </p>
                {search && (
                  <button onClick={() => handleSearchChange('')} className="text-xs mt-2 font-medium" style={{ color: 'var(--accent)' }}>
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {pagedBookings.map((b, i) => {
                  const pickup    = b.stops?.find((s) => s.type === 'pickup')
                  const dropoff   = b.stops?.find((s) => s.type === 'dropoff')
                  const isChecked = selected.has(b._id)

                  return (
                    <label
                      key={b._id}
                      className="flex items-start gap-4 px-5 py-4 cursor-pointer transition-all select-none"
                      style={{
                        background: isChecked ? 'rgba(79,70,229,0.04)' : undefined,
                        borderLeft: isChecked ? '3px solid var(--accent)' : '3px solid transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelect(b._id)}
                        className="mt-1 h-4 w-4 rounded shrink-0 cursor-pointer accent-accent"
                      />

                      {/* Stop type icon */}
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          background: tab === 'pickup' ? 'rgba(217,119,6,0.08)' : 'rgba(37,99,235,0.08)',
                          color:      tab === 'pickup' ? '#d97706' : '#2563eb',
                        }}>
                        {tab === 'pickup' ? <Package size={16} /> : <Navigation size={16} />}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Meta row */}
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <Badge status={b.status} />
                          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--fg-3)' }}>
                            <Clock size={10} />{formatTimeAgo(b.createdAt)}
                          </span>
                          {b.estimatedPrice && (
                            <span className="ml-auto text-xs font-bold mono" style={{ color: 'var(--accent)' }}>
                              ${b.estimatedPrice}
                            </span>
                          )}
                        </div>

                        {/* Route */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0"
                              style={{ background: 'rgba(22,163,74,0.12)' }}>
                              <Circle size={5} style={{ color: 'var(--success)' }} fill="var(--success)" />
                            </div>
                            <p className="text-sm font-semibold truncate" style={{ color: 'var(--fg)' }}>
                              {tab === 'pickup' ? (pickup?.address ?? '—') : (dropoff?.address ?? '—')}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0"
                              style={{ background: 'rgba(220,38,38,0.12)' }}>
                              <Circle size={5} style={{ color: 'var(--danger)' }} fill="var(--danger)" />
                            </div>
                            <p className="text-xs truncate" style={{ color: 'var(--fg-3)' }}>
                              {tab === 'pickup' ? (dropoff?.address ?? '—') : (pickup?.address ?? '—')}
                            </p>
                          </div>
                        </div>

                        {/* Package kind */}
                        {b.packageDetails?.kind && (
                          <p className="text-xs mt-1.5" style={{ color: 'var(--fg-3)' }}>
                            {b.packageDetails.kind}
                            {b.packageDetails.weightSlab && ` · ${b.packageDetails.weightSlab.replace(/_/g, ' ')}`}
                          </p>
                        )}
                      </div>

                      {/* View link */}
                      <Link
                        href={`/bookings/${b._id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 mt-1 p-1.5 rounded-lg transition-colors hover:bg-(--surface-2)"
                        style={{ color: 'var(--fg-3)' }}
                      >
                        <ChevronRight size={14} />
                      </Link>
                    </label>
                  )
                })}
              </div>
            )}
            <Pagination page={bookingPage} total={filteredBookings.length} onChange={setBookingPage} />
          </div>

          {/* ── Assign panel ──────────────────────────────────────── */}
          <div className="xl:sticky xl:top-6 space-y-4">

            {/* Selection summary */}
            <div
              className="rounded-2xl border p-4 transition-all"
              style={{
                background: selected.size > 0 ? 'rgba(79,70,229,0.04)' : 'white',
                borderColor: selected.size > 0 ? 'var(--accent)' : 'var(--border)',
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    background: selected.size > 0 ? 'var(--accent)' : 'var(--surface-2)',
                    color: selected.size > 0 ? 'white' : 'var(--fg-3)',
                  }}>
                  <Zap size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--fg)' }}>
                    {tab === 'pickup' ? 'Assign Pickups' : 'Assign Deliveries'}
                  </p>
                  <p className="text-xs" style={{ color: selected.size > 0 ? 'var(--accent)' : 'var(--fg-3)' }}>
                    {selected.size > 0
                      ? `${selected.size} booking${selected.size > 1 ? 's' : ''} selected`
                      : 'Select bookings from the list'}
                  </p>
                </div>
              </div>

              {/* Selected booking pills */}
              {selected.size > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3 p-2.5 rounded-xl" style={{ background: 'var(--surface-2)' }}>
                  {Array.from(selected).slice(0, 5).map((id) => {
                    const b = assignableBookings.find((x) => x._id === id)
                    const addr = (tab === 'pickup'
                      ? b?.stops?.find((s) => s.type === 'pickup')
                      : b?.stops?.find((s) => s.type === 'dropoff'))?.address ?? id
                    return (
                      <span key={id}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium"
                        style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                        <MapPin size={9} />
                        <span className="max-w-28 truncate">{addr}</span>
                        <button onClick={() => toggleSelect(id)} className="opacity-60 hover:opacity-100 ml-0.5">
                          <X size={9} />
                        </button>
                      </span>
                    )
                  })}
                  {selected.size > 5 && (
                    <span className="text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--fg-3)' }}>
                      +{selected.size - 5} more
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Driver select card */}
            <div className="bg-white rounded-2xl border border-border p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Users size={14} style={{ color: 'var(--fg-3)' }} />
                <p className="text-sm font-bold" style={{ color: 'var(--fg)' }}>Select Driver</p>
              </div>

              {loadingDrivers ? (
                <div className="h-10 rounded-xl animate-pulse" style={{ background: 'var(--surface-2)' }} />
              ) : drivers.length === 0 ? (
                <p className="text-sm py-3 text-center" style={{ color: 'var(--fg-3)' }}>No active drivers found.</p>
              ) : (
                <Select
                  placeholder="— Choose a driver —"
                  value={driverId}
                  onChange={setDriverId}
                  options={driverOptions}
                />
              )}

              {/* Driver status card */}
              {selectedDriver && (
                <div className="rounded-xl p-3 flex items-center gap-3"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                    {selectedDriver.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--fg)' }}>{selectedDriver.name}</p>
                    {selectedDriver.pendingStopCount > 0 && (
                      <p className="text-xs" style={{ color: 'var(--fg-3)' }}>
                        {selectedDriver.pendingStopCount} active stops
                      </p>
                    )}
                  </div>
                  <CheckCircle2 size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />
                </div>
              )}

              {/* Warning — driver has existing route */}
              {selectedDriver?.pendingStopCount > 0 && (
                <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-xs"
                  style={{ background: 'var(--warning-bg)', border: '1px solid rgba(217,119,6,0.3)', color: 'var(--warning)' }}>
                  <AlertCircle size={13} className="mt-0.5 shrink-0" />
                  <span>This driver already has {selectedDriver.pendingStopCount} active stop{selectedDriver.pendingStopCount > 1 ? 's' : ''}. New stops will be merged into their route.</span>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-xs"
                  style={{ background: 'var(--danger-bg)', border: '1px solid rgba(220,38,38,0.3)', color: 'var(--danger)' }}>
                  <AlertCircle size={13} className="mt-0.5 shrink-0" />{error}
                </div>
              )}

              <Button
                onClick={handleAssign}
                loading={assigning || isPending}
                disabled={selected.size === 0 || !driverId}
                variant="primary"
                className="w-full justify-center"
              >
                {assigning || isPending ? 'Assigning…' : (
                  <>
                    {tab === 'pickup' ? 'Assign Pickups' : 'Assign Deliveries'}
                    {selected.size > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 rounded-md text-xs font-bold" style={{ background: 'rgba(255,255,255,0.25)' }}>
                        {selected.size}
                      </span>
                    )}
                  </>
                )}
              </Button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
