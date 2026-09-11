'use client'

import { useState, useTransition, useCallback, useEffect, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  Search, X, Plus, FileText, Pencil, Trash2,
  Download, ChevronLeft, ChevronRight,
  CheckCircle2, AlertTriangle, Send, Loader2,
  TrendingUp, DollarSign, BarChart2,
} from 'lucide-react'
import { triggerPrint } from './InvoicePDF'
import { useToast } from '@/components/ui/Toast'
import Select from '@/components/ui/Select'
import { formatDateOnly as formatDateShared, calgaryYearMonth } from '@/lib/dateFormat'

const PAGE_SIZE = 20

const STATUS_CONFIG = {
  draft:   { label: 'Draft',   color: '#64748b', bg: 'rgba(100,116,139,0.1)', icon: FileText },
  sent:    { label: 'Sent',    color: '#2563eb', bg: 'rgba(37,99,235,0.1)',   icon: Send },
  paid:    { label: 'Paid',    color: '#16a34a', bg: 'rgba(22,163,74,0.1)',   icon: CheckCircle2 },
  overdue: { label: 'Overdue', color: '#dc2626', bg: 'rgba(220,38,38,0.1)',   icon: AlertTriangle },
}

const STATUS_FILTER_OPTIONS = [
  { value: '',        label: 'All Invoices' },
  { value: 'draft',   label: 'Draft' },
  { value: 'sent',    label: 'Sent' },
  { value: 'paid',    label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
]

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft
  const Icon = cfg.icon
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: cfg.bg, color: cfg.color }}>
      <Icon size={10} />
      {cfg.label}
    </span>
  )
}

function formatMoney(amount, currency = 'CAD') {
  return `${currency} $${Number(amount ?? 0).toFixed(2)}`
}

function calcTotals(invoice) {
  const items    = invoice.items ?? []
  const subtotal = items.reduce((s, it) => s + (it.rate ?? 0) * (it.quantity ?? 0), 0)
  const taxAmt   = Math.round(subtotal * ((invoice.taxRate ?? 5) / 100) * 100) / 100
  const total    = subtotal + taxAmt
  const balance  = total - (invoice.amountPaid ?? 0)
  return { subtotal, taxAmt, total, balance }
}

function formatDate(val) {
  return formatDateShared(val)
}

function Pagination({ page, total, pageSize, onNavigate }) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null
  const start = (page - 1) * pageSize + 1
  const end   = Math.min(page * pageSize, total)
  return (
    <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border" style={{ background: 'var(--surface-2)' }}>
      <span className="text-xs" style={{ color: 'var(--fg-3)' }}>{start}–{end} of {total}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onNavigate(page - 1)} disabled={page === 1}
          className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ color: 'var(--fg-2)' }}>
          <ChevronLeft size={13} />
        </button>
        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + Math.max(1, page - 3))
          .filter(p => p <= totalPages)
          .map(p => (
            <button key={p} onClick={() => onNavigate(p)}
              className="w-7 h-7 rounded-lg text-xs font-semibold transition-all"
              style={{ background: page === p ? 'var(--accent)' : 'transparent', color: page === p ? '#fff' : 'var(--fg-2)' }}>
              {p}
            </button>
          ))}
        <button onClick={() => onNavigate(page + 1)} disabled={page === totalPages}
          className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ color: 'var(--fg-2)' }}>
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 flex items-start justify-center z-50 p-4 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div
        className={`bg-white rounded-2xl shadow-xl my-8 w-full ${wide ? 'max-w-3xl' : 'max-w-md'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 border-b border-border rounded-t-2xl bg-white z-10">
          <h2 className="text-base font-bold" style={{ color: 'var(--fg)' }}>{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--fg-3)' }}>
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtCAD(n) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${Number(n ?? 0).toFixed(0)}`
}

function StatCard({ icon: Icon, label, value, sub, color = 'var(--accent)' }) {
  return (
    <div className="rounded-xl border border-border bg-white p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}18` }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: 'var(--fg-3)' }}>{label}</p>
        <p className="text-xl font-bold leading-tight" style={{ color: 'var(--fg)' }}>{value}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--fg-3)' }}>{sub}</p>}
      </div>
    </div>
  )
}

// Renders a filled line/area chart of PAID revenue per bucket (day or
// month) — a trend line suits a revenue-over-time story better than bars,
// which read as "how many" rather than "how much". Points are plotted with
// even horizontal spacing (not a true value-based x-axis — buckets are
// already evenly spaced calendar units), y-axis scaled to the max revenue
// in view. Hover any point for exact paid revenue + invoice count that day.
function InvoiceRevenueChart({ data, chartHeight = 160 }) {
  const [hoverIdx, setHoverIdx] = useState(null)
  const maxRevenue = Math.max(...data.map(d => d.revenue ?? 0), 1)
  const n = data.length
  const padTop = 16 // room for the value label above the highest point

  // Points in a 0-100 (x) by 0-100 (y) viewBox, y=0 at top (SVG convention).
  const points = data.map((d, i) => {
    const x = n > 1 ? (i / (n - 1)) * 100 : 50
    const revenue = d.revenue ?? 0
    const valueFrac = revenue / maxRevenue
    const y = 100 - valueFrac * (100 - (padTop / chartHeight) * 100)
    return { x, y, revenue, count: d.count ?? 0, label: d.label }
  })

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath = `${linePath} L ${points[n - 1]?.x ?? 100} 100 L ${points[0]?.x ?? 0} 100 Z`

  // Thin out x-axis labels when there are many buckets (e.g. 31 days) so
  // they don't overlap — always keep first/last, evenly sample the rest.
  const labelEvery = n > 15 ? Math.ceil(n / 10) : 1

  return (
    <div className="relative" style={{ height: chartHeight }}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: chartHeight - 18 }}
      >
        <defs>
          <linearGradient id="invoiceRevenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16a34a" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {n > 0 && (
          <>
            <path d={areaPath} fill="url(#invoiceRevenueFill)" stroke="none" />
            <path d={linePath} fill="none" stroke="#16a34a" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            {/* Invisible hover targets — wider than the dots for an easy hit area */}
            {points.map((p, i) => (
              <rect
                key={`hit-${i}`}
                x={n > 1 ? (i / n) * 100 : 0}
                y="0"
                width={n > 1 ? 100 / n : 100}
                height="100"
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx((cur) => (cur === i ? null : cur))}
              />
            ))}
          </>
        )}
      </svg>

      {/* Point dots — plain HTML circles, not SVG, since the chart's viewBox
          scales x/y independently (preserveAspectRatio="none" to fill the
          container) which stretches an SVG <circle> into an ellipse. A
          fixed-pixel-size div positioned by percentage stays a true circle
          regardless of that scaling. */}
      {n > 0 && points.map((p, i) => {
        if (p.revenue <= 0 && hoverIdx !== i) return null
        const size = hoverIdx === i ? 8 : 5
        return (
          <div
            key={`dot-${i}`}
            className="absolute rounded-full pointer-events-none"
            style={{
              left: `${p.x}%`,
              top: `${(p.y / 100) * (chartHeight - 18)}px`,
              width: size, height: size,
              background: '#16a34a',
              border: hoverIdx === i ? '1.5px solid white' : 'none',
              boxShadow: hoverIdx === i ? '0 1px 4px rgba(0,0,0,0.25)' : 'none',
              transform: 'translate(-50%, -50%)',
            }}
          />
        )
      })}

      {/* Tooltip */}
      {hoverIdx != null && points[hoverIdx] && (
        <div
          className="absolute z-10 pointer-events-none px-2.5 py-1.5 rounded-md text-xs font-semibold shadow-lg text-center whitespace-nowrap"
          style={{
            background: 'var(--fg)', color: 'white',
            left: `${points[hoverIdx].x}%`,
            top: `${(points[hoverIdx].y / 100) * (chartHeight - 18)}px`,
            transform: 'translate(-50%, -130%)',
          }}
        >
          <div style={{ color: '#86efac' }}>{fmtCAD(points[hoverIdx].revenue)} paid</div>
          <div className="text-[10px] font-normal opacity-80">
            {points[hoverIdx].count} invoice{points[hoverIdx].count !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* X-axis labels */}
      <div className="flex mt-1">
        {data.map((d, i) => (
          <span
            key={i}
            className="flex-1 text-[9px] font-medium text-center truncate"
            style={{ color: 'var(--fg-3)', visibility: (i % labelEvery === 0 || i === n - 1) ? 'visible' : 'hidden' }}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function InvoiceStats({ stats, selectedYear, selectedMonth, onYearChange, onMonthChange }) {
  const [view, setView] = useState('monthly') // 'monthly' = per-day | 'yearly' = per-month

  // Monthly view: one bar per day of the selected month
  const dailyData = Array.from({ length: stats.daysInMonth ?? 31 }, (_, i) => {
    const day   = i + 1
    const found = (stats.byDay ?? []).find(d => d._id === day)
    return { label: String(day), count: found?.count ?? 0, revenue: found?.revenue ?? 0, total: found?.total ?? 0 }
  })

  // Yearly view: one bar per month of the selected year
  const monthlyData = MONTHS_SHORT.map((label, i) => {
    const found = (stats.byMonth ?? []).find(m => m._id === i + 1)
    return { label, count: found?.count ?? 0, revenue: found?.revenue ?? 0, total: found?.total ?? 0 }
  })

  // Stat card totals from all-year byMonth data
  const totalRevenue = (stats.byMonth ?? []).reduce((s, m) => s + (m.revenue ?? 0), 0)
  const totalBilled  = (stats.byMonth ?? []).reduce((s, m) => s + (m.total   ?? 0), 0)
  const totalCount   = (stats.byMonth ?? []).reduce((s, m) => s + (m.count   ?? 0), 0)
  const paidCount    = (stats.byMonth ?? []).reduce((s, m) => s + (m.paid    ?? 0), 0)
  const statusMap    = Object.fromEntries((stats.statusBreakdown ?? []).map(s => [s._id, s.count]))

  const nowInCalgary = calgaryYearMonth()
  const currentYear  = nowInCalgary.year
  const yearOptions  = Array.from({ length: 4 }, (_, i) => currentYear - i)

  const chartData  = view === 'monthly' ? dailyData : monthlyData
  const chartTitle = view === 'monthly'
    ? `${MONTHS_SHORT[(selectedMonth ?? nowInCalgary.month) - 1]} ${selectedYear} — paid revenue per day`
    : `${selectedYear} — paid revenue per month`

  return (
    <div className="space-y-4 anim-fade-up">
      {/* ── Stat cards (all-year totals for selectedYear) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={DollarSign} label="Revenue (paid)"  value={`CAD $${totalRevenue.toFixed(0)}`}                    sub={`${paidCount} paid invoices`}              color="#16a34a" />
        <StatCard icon={TrendingUp} label="Total billed"    value={`CAD $${totalBilled.toFixed(0)}`}                     sub={`${totalCount} invoices in ${selectedYear}`} color="var(--accent)" />
        <StatCard icon={FileText}   label="Outstanding"     value={(statusMap.sent ?? 0) + (statusMap.overdue ?? 0)}     sub={`${statusMap.overdue ?? 0} overdue`}         color="#f59e0b" />
        <StatCard icon={BarChart2}  label="Drafts"          value={statusMap.draft ?? 0}                                 sub="not yet sent"                                color="#64748b" />
      </div>

      {/* ── Chart ── */}
      <div className="rounded-xl border border-border bg-white p-5" style={{ overflow: 'visible' }}>
        {/* Controls row */}
        <div className="flex flex-wrap items-center gap-3 mb-5" style={{ position: 'relative', zIndex: 10 }}>
          {/* View toggle */}
          <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'var(--surface-2)' }}>
            {[['monthly', 'Monthly'], ['yearly', 'Yearly']].map(([v, l]) => (
              <button key={v} onClick={() => setView(v)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
                style={{
                  background: view === v ? 'white' : 'transparent',
                  color:      view === v ? 'var(--fg)' : 'var(--fg-3)',
                  boxShadow:  view === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}>
                {l}
              </button>
            ))}
          </div>

          {/* Month picker — only shown in monthly (per-day) view */}
          {view === 'monthly' && (
            <Select
              value={String(selectedMonth)}
              onChange={v => onMonthChange(parseInt(v))}
              options={MONTHS_SHORT.map((m, i) => ({ value: String(i + 1), label: m }))}
            />
          )}

          {/* Year picker */}
          <Select
            value={String(selectedYear)}
            onChange={v => onYearChange(parseInt(v))}
            options={yearOptions.map(y => ({ value: String(y), label: String(y) }))}
          />

          {/* Legend */}
          <div className="flex items-center gap-4 ml-auto">
            <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--fg-3)' }}>
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#16a34a' }} /> Paid revenue
            </span>
          </div>
        </div>

        {/* Chart title */}
        <p className="text-xs font-semibold mb-3 capitalize" style={{ color: 'var(--fg-3)' }}>{chartTitle}</p>

        <InvoiceRevenueChart data={chartData} chartHeight={160} />
      </div>
    </div>
  )
}

export default function InvoicesClient({ initialInvoices, total, currentPage, currentSearch, currentStatus, stats }) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const toast        = useToast()

  const [search, setSearch]             = useState(currentSearch ?? '')
  const [statusFilter, setStatusFilter] = useState(currentStatus ?? '')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]         = useState(false)
  const [error, setError]               = useState('')
  const [sendingId, setSendingId]       = useState(null)
  const [sentId, setSentId]             = useState(null)
  const [selectedYear, setSelectedYear]   = useState(stats?.year  ?? calgaryYearMonth().year)
  const [selectedMonth, setSelectedMonth] = useState(stats?.month ?? calgaryYearMonth().month)
  const debounceRef                       = useRef(null)

  const buildUrl = useCallback((updates) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (!v || v === '1') params.delete(k)
      else params.set(k, String(v))
    }
    if (updates.page === 1) params.delete('page')
    const qs = params.toString()
    return `${pathname}${qs ? `?${qs}` : ''}`
  }, [pathname, searchParams])

  function navigate(updates) {
    startTransition(() => router.push(buildUrl(updates), { scroll: false }))
  }

  useEffect(() => {
    if (search.trim() === (currentSearch ?? '').trim()) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      navigate({ search: search.trim(), page: 1 })
    }, 400)
    return () => clearTimeout(debounceRef.current)
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleStatusChange(val) {
    setStatusFilter(val)
    navigate({ status: val, page: 1 })
  }

  function handleYearChange(yr) {
    setSelectedYear(yr)
    navigate({ year: yr, page: 1 })
  }

  function handleMonthChange(mo) {
    setSelectedMonth(mo)
    navigate({ month: mo, page: 1 })
  }

  async function handleSend(inv) {
    if (sendingId) return
    setSendingId(inv._id)
    setSentId(null)
    try {
      const res = await fetch(`/api/invoices/${inv._id}/send`, { method: 'POST' })
      const b   = await res.json()
      if (!res.ok) {
        toast.error('Failed to send invoice', b.error || 'Please try again.')
        return
      }
      setSentId(inv._id)
      toast.success('Invoice sent!', `Invoice emailed to ${b.sentTo}`)
      startTransition(() => router.refresh())
      setTimeout(() => setSentId(null), 3000)
    } catch {
      toast.error('Network error', 'Could not reach the server. Please try again.')
    } finally {
      setSendingId(null)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/invoices/${deleteTarget._id}`, { method: 'DELETE' })
      if (!res.ok) { const b = await res.json(); setError(b.error || 'Delete failed'); return }
      setDeleteTarget(null)
      startTransition(() => router.refresh())
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 anim-fade-up">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>Invoices</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--fg-3)' }}>
            Create, manage and download client invoices
          </p>
        </div>
        <button
          onClick={() => router.push('/admin/invoices/new')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          <Plus size={15} /> New Invoice
        </button>
      </div>

      {/* ── Stats + Chart ── */}
      {stats && (
        <InvoiceStats
          stats={stats}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          onYearChange={handleYearChange}
          onMonthChange={handleMonthChange}
        />
      )}

      {/* ── Search + Status Filter ── */}
      <div className="flex flex-col sm:flex-row gap-3 anim-fade-up s1">
        <div className="relative flex-1">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
            {isPending
              ? <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent)' }} />
              : <Search size={14} style={{ color: 'var(--fg-3)' }} />
            }
          </div>
          <input
            type="text"
            placeholder="Search by invoice #, client name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 rounded-xl border bg-white text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-all"
            style={{ color: 'var(--fg)', borderColor: isPending ? 'var(--accent)' : 'var(--border)' }}
          />
          {search && !isPending && (
            <button type="button" onClick={() => { setSearch(''); navigate({ search: '', page: 1 }); clearTimeout(debounceRef.current) }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--fg-3)' }}>
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleStatusChange(opt.value)}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all"
              style={{
                background:  statusFilter === opt.value ? 'var(--accent)' : 'white',
                color:       statusFilter === opt.value ? 'white' : 'var(--fg-2)',
                borderColor: statusFilter === opt.value ? 'var(--accent)' : 'var(--border)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Invoice List ── */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden anim-fade-up s2"
        style={{ opacity: isPending ? 0.6 : 1, transition: 'opacity 0.2s' }}>

        {initialInvoices.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'var(--surface-2)' }}>
              <FileText size={28} style={{ color: 'var(--fg-3)' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--fg-2)' }}>No invoices found</p>
            <button onClick={() => router.push('/admin/invoices/new')} className="mt-3 text-sm font-semibold" style={{ color: 'var(--accent)' }}>
              Create your first invoice →
            </button>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                    {['Invoice #', 'Client', 'Date', 'Due', 'Amount', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--fg-3)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {initialInvoices.map(inv => {
                    const { balance } = calcTotals(inv)
                    return (
                      <tr key={inv._id}
                        className="group hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => router.push(`/admin/invoices/${inv._id}`)}>
                        <td className="px-5 py-3.5">
                          <span className="text-sm font-bold" style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>{inv.invoiceNumber}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>{inv.clientName}</div>
                          {inv.clientEmail && <div className="text-xs" style={{ color: 'var(--fg-3)' }}>{inv.clientEmail}</div>}
                        </td>
                        <td className="px-5 py-3.5 text-xs" style={{ color: 'var(--fg-2)' }}>{formatDate(inv.invoiceDate)}</td>
                        <td className="px-5 py-3.5 text-xs" style={{ color: 'var(--fg-2)' }}>
                          {inv.dueDate ? formatDate(inv.dueDate) : (inv.paymentTerms ?? '—')}
                        </td>
                        <td className="px-5 py-3.5 text-sm font-bold" style={{ color: 'var(--fg)', fontFamily: 'monospace' }}>
                          {formatMoney(balance, inv.currency)}
                        </td>
                        <td className="px-5 py-3.5"><StatusBadge status={inv.status} /></td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => triggerPrint(inv)}
                              title="Download PDF"
                              className="p-1.5 rounded-lg transition-colors"
                              style={{ color: 'var(--fg-3)' }}
                              onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                              onMouseLeave={e => e.currentTarget.style.color = 'var(--fg-3)'}>
                              <Download size={14} />
                            </button>
                            <button
                              onClick={() => handleSend(inv)}
                              disabled={sendingId === inv._id}
                              title={sentId === inv._id ? 'Sent!' : 'Send to client'}
                              className="p-1.5 rounded-lg transition-colors disabled:opacity-50"
                              style={{ color: sentId === inv._id ? '#16a34a' : 'var(--fg-3)' }}
                              onMouseEnter={e => { if (sendingId !== inv._id) e.currentTarget.style.color = '#2563eb' }}
                              onMouseLeave={e => { if (sentId !== inv._id) e.currentTarget.style.color = 'var(--fg-3)' }}>
                              {sendingId === inv._id
                                ? <Loader2 size={14} className="animate-spin" />
                                : sentId === inv._id
                                ? <CheckCircle2 size={14} />
                                : <Send size={14} />}
                            </button>
                            <button
                              onClick={() => router.push(`/admin/invoices/${inv._id}/edit`)}
                              title="Edit"
                              className="p-1.5 rounded-lg transition-colors"
                              style={{ color: 'var(--fg-3)' }}
                              onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                              onMouseLeave={e => e.currentTarget.style.color = 'var(--fg-3)'}>
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(inv)}
                              title="Delete"
                              className="p-1.5 rounded-lg transition-colors"
                              style={{ color: 'var(--fg-3)' }}
                              onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                              onMouseLeave={e => e.currentTarget.style.color = 'var(--fg-3)'}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-border">
              {initialInvoices.map(inv => {
                const { balance } = calcTotals(inv)
                return (
                  <div key={inv._id} className="flex items-center gap-3 px-4 py-4 cursor-pointer"
                    onClick={() => router.push(`/admin/invoices/${inv._id}`)}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                      <FileText size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>{inv.invoiceNumber}</span>
                        <StatusBadge status={inv.status} />
                      </div>
                      <div className="text-sm font-medium truncate mt-0.5" style={{ color: 'var(--fg)' }}>{inv.clientName}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--fg-3)' }}>{formatDate(inv.invoiceDate)}</div>
                    </div>
                    <div className="text-right shrink-0" onClick={e => e.stopPropagation()}>
                      <div className="text-sm font-bold mb-1" style={{ color: 'var(--fg)' }}>{formatMoney(balance, inv.currency)}</div>
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => triggerPrint(inv)} className="p-1 rounded" style={{ color: 'var(--fg-3)' }}>
                          <Download size={13} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleSend(inv) }}
                          disabled={sendingId === inv._id}
                          title={sentId === inv._id ? 'Sent!' : 'Send to client'}
                          className="p-1 rounded disabled:opacity-50"
                          style={{ color: sentId === inv._id ? '#16a34a' : 'var(--fg-3)' }}>
                          {sendingId === inv._id
                            ? <Loader2 size={13} className="animate-spin" />
                            : sentId === inv._id
                            ? <CheckCircle2 size={13} />
                            : <Send size={13} />}
                        </button>
                        <button onClick={() => router.push(`/admin/invoices/${inv._id}/edit`)} className="p-1 rounded" style={{ color: 'var(--fg-3)' }}>
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => setDeleteTarget(inv)} className="p-1 rounded" style={{ color: 'var(--danger)' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <Pagination page={currentPage} total={total} pageSize={PAGE_SIZE} onNavigate={p => navigate({ page: p })} />
          </>
        )}
      </div>

      {/* ── Delete Confirm Modal ── */}
      {deleteTarget && (
        <Modal title="Delete Invoice?" onClose={() => !deleting && setDeleteTarget(null)}>
          {error && <p className="mb-4 text-sm font-medium px-3 py-2 rounded-lg" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>{error}</p>}
          <p className="text-sm mb-6" style={{ color: 'var(--fg-2)' }}>
            This will permanently delete invoice <strong>{deleteTarget.invoiceNumber}</strong> for <strong>{deleteTarget.clientName}</strong>.
            This action cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setDeleteTarget(null)} disabled={deleting}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-border disabled:opacity-50"
              style={{ color: 'var(--fg-2)' }}>
              Cancel
            </button>
            <button onClick={handleDelete} disabled={deleting}
              className="px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
              style={{ background: 'var(--danger)', color: 'white' }}>
              {deleting ? 'Deleting…' : 'Delete Invoice'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
