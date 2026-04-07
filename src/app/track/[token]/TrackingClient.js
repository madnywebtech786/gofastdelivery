'use client'

import { useState } from 'react'
import BookingStatusListener from '@/components/realtime/BookingStatusListener'

const STATUS_COLORS = {
  pending:           { bg: 'bg-slate-100',  text: 'text-slate-600',  dot: 'bg-slate-400',  ring: 'ring-slate-200'  },
  assigned_pickup:   { bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-500',   ring: 'ring-blue-200'   },
  picked_up:         { bg: 'bg-violet-50',  text: 'text-violet-700', dot: 'bg-violet-500', ring: 'ring-violet-200' },
  assigned_delivery: { bg: 'bg-amber-50',   text: 'text-amber-700',  dot: 'bg-amber-500',  ring: 'ring-amber-200'  },
  delivered:         { bg: 'bg-green-50',   text: 'text-green-700',  dot: 'bg-green-500',  ring: 'ring-green-200'  },
  cancelled:         { bg: 'bg-red-50',     text: 'text-red-700',    dot: 'bg-red-400',    ring: 'ring-red-200'    },
}

const STATUS_LABELS = {
  pending:           'Order Placed',
  assigned_pickup:   'Pickup Scheduled',
  picked_up:         'Picked Up',
  assigned_delivery: 'On the Way',
  delivered:         'Delivered',
  cancelled:         'Cancelled',
}

const ORDERED_STATUSES = [
  'pending',
  'assigned_pickup',
  'picked_up',
  'assigned_delivery',
  'delivered',
]

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('en-CA', {
    timeZone: 'America/Edmonton',
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function TrackingClient({ initialBooking }) {
  const [booking, setBooking] = useState(initialBooking)

  function handleStatusChange({ status, updatedAt }) {
    setBooking((prev) => ({
      ...prev,
      status,
      updatedAt,
      statusHistory: [
        ...(prev.statusHistory ?? []),
        { status, timestamp: updatedAt, note: 'Live update' },
      ],
    }))
  }

  const status      = booking.status
  const colors      = STATUS_COLORS[status] ?? STATUS_COLORS.pending
  const currentIdx  = ORDERED_STATUSES.indexOf(status)
  const isCancelled = status === 'cancelled'
  const isDelivered = status === 'delivered'

  return (
    <>
      <BookingStatusListener bookingId={booking._id} onStatusChange={handleStatusChange} />

      {/* Current status hero */}
      <div className={`rounded-2xl shadow-sm border border-slate-100 p-5 ${colors.bg}`}>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full ${colors.dot} shadow shrink-0`}>
            {isDelivered ? (
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : isCancelled ? (
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" />
              </svg>
            )}
          </span>
          <div>
            <p className={`font-bold text-lg ${colors.text}`}>
              {STATUS_LABELS[status] ?? status}
            </p>
            <p className="text-xs text-slate-500">Current status</p>
          </div>
        </div>
      </div>

      {/* Progress stepper */}
      {!isCancelled && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Progress</p>
          <ol className="flex items-start">
            {ORDERED_STATUSES.map((s, i) => {
              const done    = currentIdx >= i
              const current = currentIdx === i
              const last    = i === ORDERED_STATUSES.length - 1
              const sc      = STATUS_COLORS[s]
              return (
                <li key={s} className="flex-1 flex flex-col items-center relative">
                  {!last && (
                    <div className={`absolute top-4 left-1/2 w-full h-0.5 ${done && currentIdx > i ? 'bg-blue-400' : 'bg-slate-200'}`} />
                  )}
                  <div className={[
                    'relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all',
                    done ? `${sc.dot} text-white border-transparent shadow-sm` : 'bg-white text-slate-300 border-slate-200',
                    current ? `ring-4 ${sc.ring}` : '',
                  ].join(' ')}>
                    {done ? (
                      current
                        ? <span className="w-2 h-2 rounded-full bg-white block" />
                        : <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <span>{i + 1}</span>
                    )}
                  </div>
                  <p className={`text-center mt-2 leading-tight px-0.5 ${current ? 'text-[11px] font-bold text-slate-700' : 'text-[10px] text-slate-400'}`}>
                    {STATUS_LABELS[s]}
                  </p>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      {/* Status history */}
      {(booking.statusHistory?.length ?? 0) > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">History</p>
          <ol className="relative border-l-2 border-slate-100 ml-2 space-y-5">
            {[...booking.statusHistory].reverse().map((h, i) => {
              const sc = STATUS_COLORS[h.status] ?? STATUS_COLORS.pending
              return (
                <li key={i} className="pl-6 relative">
                  <span className={`absolute -left-2 top-1 w-4 h-4 rounded-full border-2 border-white ${sc.dot} ${i === 0 ? `ring-4 ${sc.ring}` : ''}`} />
                  <p className={`text-sm font-semibold ${i === 0 ? sc.text : 'text-slate-700'}`}>
                    {STATUS_LABELS[h.status] ?? h.status}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{formatDate(h.timestamp)}</p>
                  {h.note && h.note !== 'Live update' && (
                    <p className="text-xs text-slate-500 mt-0.5">{h.note}</p>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </>
  )
}
