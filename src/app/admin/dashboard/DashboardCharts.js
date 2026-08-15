'use client'

import { useMemo, useState } from 'react'
import { DollarSign, TrendingUp, PackageCheck, AlertTriangle } from 'lucide-react'
import { calgaryDateKey } from '@/lib/dateFormat'

// Reuses this app's own established status semantics (Badge.js STATUS_CONFIG):
// delivered = green (good), cancelled/failed = red (critical). Revenue uses the
// brand accent, not the status-good green — it's a magnitude, not a status.
const GOOD = '#16a34a'
const CRITICAL = '#dc2626'
const NEUTRAL = '#94a3b8'

function fmtMoney(n) {
  const v = Number(n ?? 0)
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`
  return `$${v.toFixed(0)}`
}

function fmtDateShort(isoDay) {
  const [, m, d] = isoDay.split('-')
  return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m) - 1]} ${Number(d)}`
}

function StatPill({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-white">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}15` }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-none" style={{ color: 'var(--fg)' }}>{value}</p>
        <p className="text-[11px] font-medium mt-1" style={{ color: 'var(--fg-3)' }}>{label}{sub ? ` · ${sub}` : ''}</p>
      </div>
    </div>
  )
}

// Revenue area chart — single series (sequential/magnitude job), brand-accent
// wash fill, 2px line, crosshair + tooltip. Fills the full 30-day window even
// when a day has zero data so the trend line never silently skips days.
function RevenueArea({ byDay, days }) {
  const [hoverIdx, setHoverIdx] = useState(null)
  const W = 600
  const H = 160
  const PAD_L = 4
  const PAD_R = 4
  const PAD_T = 12
  const PAD_B = 20

  const maxRevenue = Math.max(...byDay.map(d => d.revenue), 1)
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B
  const n = byDay.length

  const points = byDay.map((d, i) => {
    const x = PAD_L + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW)
    const y = PAD_T + plotH - (d.revenue / maxRevenue) * plotH
    return { x, y, d }
  })

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
  const areaPath = `${linePath} L ${points[n - 1].x.toFixed(2)} ${(PAD_T + plotH).toFixed(2)} L ${points[0].x.toFixed(2)} ${(PAD_T + plotH).toFixed(2)} Z`

  const hover = hoverIdx != null ? points[hoverIdx] : null
  // Show ~6 date ticks across the window regardless of day count
  const tickEvery = Math.max(1, Math.round(n / 6))

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 160 }}
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const relX = ((e.clientX - rect.left) / rect.width) * W
          let closest = 0
          let closestDist = Infinity
          points.forEach((p, i) => {
            const dist = Math.abs(p.x - relX)
            if (dist < closestDist) { closestDist = dist; closest = i }
          })
          setHoverIdx(closest)
        }}
      >
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Baseline */}
        <line x1={PAD_L} y1={PAD_T + plotH} x2={W - PAD_R} y2={PAD_T + plotH} stroke="var(--border)" strokeWidth="1" />

        {/* Area + line */}
        <path d={areaPath} fill="url(#revenueFill)" />
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Crosshair */}
        {hover && (
          <>
            <line x1={hover.x} y1={PAD_T} x2={hover.x} y2={PAD_T + plotH} stroke="var(--border-2)" strokeWidth="1" strokeDasharray="3,3" />
            <circle cx={hover.x} cy={hover.y} r="4" fill="var(--accent)" stroke="white" strokeWidth="2" />
          </>
        )}

        {/* Date ticks */}
        {points.map((p, i) => (
          (i === 0 || i === n - 1 || i % tickEvery === 0) ? (
            <text key={i} x={p.x} y={H - 4} fontSize="9" textAnchor="middle" fill="var(--fg-3)">
              {fmtDateShort(p.d._id)}
            </text>
          ) : null
        ))}
      </svg>

      {hover && (
        <div
          className="absolute pointer-events-none px-3 py-2 rounded-lg shadow-lg text-xs z-10 -translate-x-1/2"
          style={{
            left: `${(hover.x / W) * 100}%`,
            top: Math.max(hover.y - 64, 0),
            background: 'var(--fg)',
            color: 'white',
            whiteSpace: 'nowrap',
          }}
        >
          <div className="font-bold">{fmtMoney(hover.d.revenue)}</div>
          <div style={{ color: 'rgba(255,255,255,0.65)' }}>{fmtDateShort(hover.d._id)} · {hover.d.delivered} delivered</div>
        </div>
      )}
    </div>
  )
}

// Delivery outcome strip — stacked thin columns per day, status colors
// (delivered=good, failed=critical, cancelled=neutral — kept visually
// distinct from failed since a customer cancellation is not an operational
// failure), 2px surface gap between segments and between bars.
function OutcomeBars({ byDay }) {
  const [hoverIdx, setHoverIdx] = useState(null)
  const maxTotal = Math.max(...byDay.map(d => d.bookings), 1)

  return (
    <div>
      <div className="flex items-end gap-[2px]" style={{ height: 96 }}>
        {byDay.map((d, i) => {
          const inProgress = Math.max(d.bookings - d.delivered - d.cancelled - d.failed, 0)
          const total = d.bookings
          const isHover = hoverIdx === i
          return (
            <div
              key={d._id}
              className="flex-1 h-full flex flex-col justify-end relative min-w-0 cursor-default"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
            >
              {isHover && total > 0 && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                  <div className="px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shadow-lg text-center" style={{ background: 'var(--fg)', color: 'white' }}>
                    <div>{fmtDateShort(d._id)}</div>
                    <div style={{ color: '#86efac' }}>{d.delivered} delivered</div>
                    {d.failed > 0 && <div style={{ color: '#fca5a5' }}>{d.failed} failed</div>}
                    {d.cancelled > 0 && <div style={{ color: '#cbd5e1' }}>{d.cancelled} cancelled</div>}
                  </div>
                </div>
              )}
              <div
                className="w-full rounded-t-[3px] flex flex-col justify-end overflow-hidden transition-opacity"
                style={{
                  height: `${total > 0 ? Math.max((total / maxTotal) * 100, 5) : 0}%`,
                  opacity: isHover ? 1 : 0.9,
                }}
              >
                {inProgress > 0 && <div style={{ height: `${(inProgress / total) * 100}%`, background: NEUTRAL }} />}
                {d.cancelled > 0 && <div style={{ height: `${(d.cancelled / total) * 100}%`, background: '#cbd5e1' }} />}
                {d.failed > 0 && <div style={{ height: `${(d.failed / total) * 100}%`, background: CRITICAL }} />}
                {d.delivered > 0 && <div style={{ height: `${(d.delivered / total) * 100}%`, background: GOOD }} />}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--fg-3)' }}>
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: GOOD }} /> Delivered
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--fg-3)' }}>
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: CRITICAL }} /> Failed
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--fg-3)' }}>
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#cbd5e1' }} /> Cancelled
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--fg-3)' }}>
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: NEUTRAL }} /> In progress
        </span>
      </div>
    </div>
  )
}

export default function DashboardCharts({ stats }) {
  const { byDay, totals, days } = stats

  // byDay from Mongo only has entries for days with ≥1 booking — fill the
  // full window so the x-axis never silently skips a zero day.
  const filledByDay = useMemo(() => {
    const map = new Map(byDay.map(d => [d._id, d]))
    const out = []
    // Keys must match the server's grouping, which buckets by Calgary calendar
    // day ($dateToString ... timezone: CALGARY_TZ in getDashboardStats), so the
    // window starts from windowStart's Calgary date and then steps by whole
    // calendar days in UTC — pure date arithmetic, immune to both the viewer's
    // timezone and the 23h/25h days at a DST transition.
    const cursor = new Date(`${calgaryDateKey(stats.windowStart)}T00:00:00.000Z`)
    for (let i = 0; i < days; i++) {
      const key = cursor.toISOString().slice(0, 10)
      out.push(map.get(key) ?? { _id: key, bookings: 0, delivered: 0, cancelled: 0, failed: 0, revenue: 0 })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return out
  }, [byDay, days, stats.windowStart])

  const failurePct = (totals.failureRate * 100).toFixed(1)

  return (
    <div className="anim-fade-up s1">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatPill icon={DollarSign} label="Revenue" sub={`last ${days}d`} value={fmtMoney(totals.revenue)} color="var(--accent)" />
        <StatPill icon={TrendingUp} label="Avg order value" value={fmtMoney(totals.avgOrderValue)} color="#2563eb" />
        <StatPill icon={PackageCheck} label="Delivered" sub={`last ${days}d`} value={totals.deliveredCount} color={GOOD} />
        <StatPill icon={AlertTriangle} label="Failure rate" value={`${failurePct}%`} sub={`${totals.failedCount} failed`} color={totals.failureRate > 0.1 ? CRITICAL : 'var(--fg-3)'} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-white p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>Revenue trend</h2>
            <span className="text-xs" style={{ color: 'var(--fg-3)' }}>last {days} days</span>
          </div>
          <p className="text-xs mb-2" style={{ color: 'var(--fg-3)' }}>Estimated value of delivered bookings</p>
          <RevenueArea byDay={filledByDay} days={days} />
        </div>

        <div className="rounded-xl border border-border bg-white p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--fg)' }}>Delivery outcomes</h2>
            <span className="text-xs" style={{ color: 'var(--fg-3)' }}>last {days} days</span>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--fg-3)' }}>Daily bookings by result</p>
          <OutcomeBars byDay={filledByDay} />
        </div>
      </div>
    </div>
  )
}
