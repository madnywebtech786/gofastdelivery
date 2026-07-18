'use client'

import { useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import {
  ArrowLeft, Mail, Phone, ChevronLeft, ChevronRight,
  Truck, Package, Route, TrendingUp,
} from 'lucide-react'
import Link from 'next/link'
import Select from '@/components/ui/Select'
import ResetPasswordButton from './ResetPasswordButton'
import EditDriverButton from './EditDriverButton'

const BRAND       = '#1bb908'
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, accent = BRAND }) {
  return (
    <div className="relative rounded-2xl border border-border bg-white p-5 flex flex-col gap-3 overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full pointer-events-none"
        style={{ background: `${accent}12` }} />
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${accent}15` }}>
        <Icon size={18} style={{ color: accent }} />
      </div>
      <div>
        <p className="text-2xl font-black leading-none tracking-tight" style={{ color: 'var(--fg)' }}>{value}</p>
        <p className="text-xs font-semibold uppercase tracking-widest mt-1.5" style={{ color: 'var(--fg-3)' }}>{label}</p>
        {sub && <p className="text-xs mt-1" style={{ color: 'var(--fg-3)' }}>{sub}</p>}
      </div>
    </div>
  )
}

// ── Bar chart ──────────────────────────────────────────────────────────────────
function DriverBars({ data, height = 120 }) {
  const maxCount = Math.max(...data.map(d => d.count), 1)
  // Bar area gets a fixed pixel height of its own (separate from the label
  // row below) so each bar's `height: ${pct}%` resolves against a real,
  // definite box — a flex child with no explicit height (the old layout)
  // lets percentage heights collapse to whatever the content needs, which is
  // why differently-sized bars all rendered at roughly the same height.
  const barAreaHeight = height - 16 // reserve ~16px for the day-label row below
  return (
    <div className="flex items-end gap-0.5">
      {data.map((d, i) => {
        const pct = d.count > 0 ? Math.max((d.count / maxCount) * 100, 6) : 0
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative min-w-0">
            <div className="w-full flex flex-col justify-end" style={{ height: barAreaHeight }}>
              {d.count > 0 && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none
                  opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <div className="px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shadow-xl text-center"
                    style={{ background: 'var(--fg)', color: 'white' }}>
                    {d.count} {d.count === 1 ? 'delivery' : 'deliveries'}
                  </div>
                </div>
              )}
              <div className="w-full rounded-t-sm transition-all duration-500"
                style={{
                  height: `${pct}%`,
                  minHeight: d.count > 0 ? '4px' : '0',
                  background: d.count > 0
                    ? `linear-gradient(to top, ${BRAND}, ${BRAND}cc)`
                    : 'var(--border)',
                  opacity: d.count > 0 ? 1 : 0.3,
                }} />
            </div>
            <span className="text-[9px] font-semibold truncate w-full text-center"
              style={{ color: 'var(--fg-3)' }}>{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Chart section ──────────────────────────────────────────────────────────────
function DriverChart({ stats, selectedYear, selectedMonth, onYearChange, onMonthChange }) {
  const [view, setView] = useState('monthly')
  const now = new Date()
  const currentYear = now.getFullYear()
  const yearOptions = Array.from({ length: 4 }, (_, i) => ({ value: String(currentYear - i), label: String(currentYear - i) }))
  const monthOptions = MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))

  const dailyData = Array.from({ length: stats.daysInMonth ?? 31 }, (_, i) => {
    const day = i + 1
    const found = (stats.byDay ?? []).find(d => d._id === day)
    return { label: String(day), count: found?.count ?? 0 }
  })

  const monthlyData = MONTHS.map((label, i) => {
    const found = (stats.byMonth ?? []).find(m => m._id === i + 1)
    return { label, count: found?.count ?? 0 }
  })

  const chartData  = view === 'monthly' ? dailyData : monthlyData
  const totalShown = chartData.reduce((s, d) => s + d.count, 0)
  const chartTitle = view === 'monthly'
    ? `${MONTHS[(selectedMonth ?? 1) - 1]} ${selectedYear} — deliveries per day`
    : `${selectedYear} — deliveries per month`

  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Toggle */}
        <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background: 'var(--surface-2)' }}>
          {[['monthly', 'Monthly'], ['yearly', 'Yearly']].map(([v, l]) => (
            <button key={v} onClick={() => setView(v)}
              className="px-3 py-1.5 rounded-md text-xs font-bold transition-all"
              style={{
                background: view === v ? 'white' : 'transparent',
                color:      view === v ? 'var(--fg)' : 'var(--fg-3)',
                boxShadow:  view === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>
              {l}
            </button>
          ))}
        </div>

        {view === 'monthly' && (
          <Select
            value={String(selectedMonth)}
            onChange={v => onMonthChange(parseInt(v))}
            options={monthOptions}
          />
        )}
        <Select
          value={String(selectedYear)}
          onChange={v => onYearChange(parseInt(v))}
          options={yearOptions}
        />

        <div className="ml-auto text-right">
          <span className="text-2xl font-black" style={{ color: BRAND }}>{totalShown}</span>
          <span className="text-xs ml-1.5 font-semibold" style={{ color: 'var(--fg-3)' }}>
            {view === 'monthly' ? 'this month' : 'this year'}
          </span>
        </div>
      </div>

      <p className="text-xs font-semibold mb-4 capitalize" style={{ color: 'var(--fg-3)' }}>{chartTitle}</p>
      <DriverBars data={chartData} height={130} />
    </div>
  )
}

// ── Main client component ──────────────────────────────────────────────────────
const STATUS_LABEL = {
  pending:            { label: 'Pending',          color: '#f59e0b' },
  assigned_pickup:    { label: 'Assigned Pickup',  color: '#2563eb' },
  picked_up:          { label: 'Picked Up',        color: '#8b5cf6' },
  assigned_delivery:  { label: 'Assigned Delivery',color: '#0ea5e9' },
  delivered:          { label: 'Delivered',        color: '#1bb908' },
  cancelled:          { label: 'Cancelled',        color: '#6b7280' },
  failed_pickup:      { label: 'Failed Pickup',    color: '#ef4444' },
  failed_dropoff:     { label: 'Failed Drop-off',  color: '#ef4444' },
}

const PAGE_SIZE = 10

export default function DriverDetailClient({ driver: d, route: r, stats, bookings = [], driverId }) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [selectedYear, setSelectedYear]   = useState(stats?.year  ?? new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(stats?.month ?? new Date().getMonth() + 1)

  const buildUrl = useCallback((updates) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, String(v)); else params.delete(k)
    }
    return `${pathname}?${params.toString()}`
  }, [pathname, searchParams])

  function navigate(updates) {
    startTransition(() => router.push(buildUrl(updates), { scroll: false }))
  }

  function handleYearChange(yr) {
    setSelectedYear(yr)
    navigate({ year: yr })
  }
  function handleMonthChange(mo) {
    setSelectedMonth(mo)
    navigate({ month: mo })
  }

  const [page, setPage] = useState(1)

  // 1 metre = 0.000621371 miles
  const milesDriven = ((stats?.totalDistanceDrivenMeters ?? 0) * 0.000621371).toFixed(1)
  const isOnDuty   = d.driverProfile?.isOnDuty ?? false
  const totalPages = Math.max(1, Math.ceil(bookings.length / PAGE_SIZE))
  const pageItems  = bookings.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center gap-4 anim-fade-up">
        <Link href="/admin/drivers"
          className="w-9 h-9 rounded-xl border border-border flex items-center justify-center transition-colors hover:bg-(--surface-2) shrink-0"
          style={{ color: 'var(--fg-3)' }}>
          <ArrowLeft size={15} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--fg)' }}>{d.name}</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
              style={{
                background: isOnDuty ? `${BRAND}15` : 'var(--surface-2)',
                color:      isOnDuty ? BRAND : 'var(--fg-3)',
              }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block"
                style={{ background: isOnDuty ? BRAND : 'var(--fg-3)' }} />
              {isOnDuty ? 'On Duty' : 'Off Duty'}
            </span>
          </div>
          <p className="text-sm mt-0.5" style={{ color: 'var(--fg-3)' }}>{d.email}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <EditDriverButton driverId={driverId} driver={d} onSaved={() => router.refresh()} />
          <ResetPasswordButton driverId={driverId} driverName={d.name} />
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 anim-fade-up s1">
        <StatCard
          icon={Package}
          label="Deliveries"
          value={stats?.totalCompletedBookings ?? 0}
          sub="all-time completed"
          accent={BRAND}
        />
        <StatCard
          icon={Truck}
          label="Miles Driven"
          value={`${milesDriven}`}
          sub="total distance"
          accent="#2563eb"
        />
        <StatCard
          icon={Route}
          label="Routes"
          value={stats?.totalRoutes ?? 0}
          sub="all-time assigned"
          accent="#f59e0b"
        />
        <StatCard
          icon={TrendingUp}
          label="This Month"
          value={(stats?.byMonth ?? []).find(m => m._id === selectedMonth)?.count ?? 0}
          sub={`${MONTHS[selectedMonth - 1]} deliveries`}
          accent="#8b5cf6"
        />
      </div>

      {/* ── Chart ── */}
      <div className="anim-fade-up s2">
        <DriverChart
          stats={stats}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          onYearChange={handleYearChange}
          onMonthChange={handleMonthChange}
        />
      </div>

      {/* ── Driver Info (full width) ── */}
      <div className="rounded-2xl border border-border bg-white overflow-hidden anim-fade-up s3">
        <div className="px-5 py-3.5 border-b border-border" style={{ background: 'var(--surface-2)' }}>
          <h2 className="text-sm font-bold" style={{ color: 'var(--fg)' }}>Driver Info</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border px-0 sm:px-0">
          {[
            { icon: Mail,  label: 'Email',  value: d.email },
            { icon: Phone, label: 'Phone',  value: d.phone ?? '—' },
            { icon: Truck, label: 'Status', value: isOnDuty ? 'On Duty' : 'Off Duty', valueColor: isOnDuty ? BRAND : 'var(--fg-3)' },
          ].map(({ icon: Icon, label, value, valueColor }) => (
            <div key={label} className="flex items-center gap-3 px-5 py-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'var(--surface-2)' }}>
                <Icon size={14} style={{ color: 'var(--fg-3)' }} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--fg-3)' }}>{label}</p>
                <p className="text-sm font-semibold truncate mt-0.5" style={{ color: valueColor ?? 'var(--fg)' }}>{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Booking History ── */}
      <div className="rounded-2xl border border-border bg-white overflow-hidden anim-fade-up s4">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between" style={{ background: 'var(--surface-2)' }}>
          <h2 className="text-sm font-bold" style={{ color: 'var(--fg)' }}>Booking History</h2>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background: 'var(--surface-2)', color: 'var(--fg-3)', border: '1px solid var(--border)' }}>
            {bookings.length} total
          </span>
        </div>

        {bookings.length === 0 ? (
          <div className="py-12 text-center">
            <Package size={28} className="mx-auto mb-2 opacity-20" style={{ color: 'var(--fg-3)' }} />
            <p className="text-sm" style={{ color: 'var(--fg-3)' }}>No bookings found for this driver.</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border">
              {pageItems.map((b) => {
                const pickup   = b.stops?.find(s => s.type === 'pickup')
                const dropoff  = b.stops?.find(s => s.type === 'dropoff')
                const st       = STATUS_LABEL[b.status] ?? { label: b.status, color: 'var(--fg-3)' }
                return (
                  <div key={b._id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold truncate" style={{ color: 'var(--fg)' }}>
                          {pickup?.address ?? '—'}
                        </span>
                        {dropoff && (
                          <>
                            <ChevronRight size={12} style={{ color: 'var(--fg-3)', flexShrink: 0 }} />
                            <span className="text-sm truncate" style={{ color: 'var(--fg-2)' }}>
                              {dropoff.address}
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--fg-3)' }}>
                        {formatDate(b.updatedAt)}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full"
                      style={{ background: `${st.color}15`, color: st.color }}>
                      {st.label}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-border" style={{ background: 'var(--surface-2)' }}>
                <span className="text-xs" style={{ color: 'var(--fg-3)' }}>
                  Page {page} of {totalPages}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40"
                    style={{ background: '#1bb908', color: 'white' }}>
                    <ChevronLeft size={13} />
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40"
                    style={{ background: '#1bb908', color: 'white' }}>
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  )
}
