import { notFound } from 'next/navigation'
import { findBookingByToken } from '@/lib/db/bookings'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, MapPin, Clock, Package } from 'lucide-react'
import TrackingClient from './TrackingClient'

export const metadata = { title: 'Track Your Delivery — GoFastDelivery' }

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('en-CA', {
    timeZone: 'America/Edmonton',
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default async function TrackingPage({ params }) {
  const { token } = await params
  const booking = await findBookingByToken(token)
  if (!booking) notFound()

  const b = JSON.parse(JSON.stringify(booking))

  return (
    <div className="min-h-screen dot-grid-bg" style={{ background: '#faf8f4' }}>

      {/* ── Top info bar (mirrors landing Navbar green strip) ── */}
      <div style={{ background: '#1bb908', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-7 flex items-center justify-between">
          <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Calgary&apos;s Same-Day Courier
          </span>
          <span className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.85)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-white opacity-70 inline-block" />
            Live Tracking
          </span>
        </div>
      </div>

      {/* ── Header (mirrors landing Navbar main bar) ── */}
      <header style={{ background: '#ffffff', borderBottom: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/">
            <Image
              src="/images/logo.png"
              alt="GoFastDelivery"
              width={120} height={40}
              className="h-8 w-auto object-contain"
              priority
            />
          </Link>
          <Link
            href="/track"
            className="inline-flex items-center gap-1.5 text-[12px] font-bold rounded-lg px-3 py-1.5 transition-colors"
            style={{ color: '#0d0d0d', border: '1px solid rgba(0,0,0,0.12)' }}
          >
            New Search
            <ArrowRight size={12} strokeWidth={2.5} />
          </Link>
        </div>
      </header>

      {/* ── Page content ── */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-4">

        {/* ── Hero tracking card ── */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: '#ffffff',
            border: '1px solid rgba(0,0,0,0.07)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          }}
        >
          {/* Orange accent top strip */}
          <div style={{ height: '3px', background: 'linear-gradient(90deg, #ff580d, #e04500)' }} />

          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p
                  className="text-[10px] font-black tracking-[0.18em] uppercase mb-1.5"
                  style={{ color: 'rgba(0,0,0,0.35)' }}
                >
                  Tracking Number
                </p>
                <p
                  className="font-mono font-bold text-xl sm:text-2xl break-all"
                  style={{ color: '#0d0d0d', letterSpacing: '0.06em' }}
                >
                  {b.trackingToken}
                </p>
              </div>
              <div
                className="flex items-center gap-2 shrink-0 px-3 py-1.5 rounded-full"
                style={{ background: 'rgba(27,185,8,0.08)', border: '1px solid rgba(27,185,8,0.15)' }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: '#1bb908', boxShadow: '0 0 6px rgba(27,185,8,0.7)' }}
                />
                <span className="text-[11px] font-bold" style={{ color: '#15960a' }}>
                  Auto-updating
                </span>
              </div>
            </div>

            {b.updatedAt && (
              <p className="text-xs mt-3 flex items-center gap-1.5" style={{ color: 'rgba(0,0,0,0.38)' }}>
                <Clock size={11} strokeWidth={2.5} />
                Last updated {formatDate(b.updatedAt)}
              </p>
            )}
          </div>
        </div>

        {/* ── Live status + progress stepper (client) ── */}
        <TrackingClient initialBooking={b} />

        {/* ── Route / Stops ── */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: '#ffffff',
            border: '1px solid rgba(0,0,0,0.07)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          }}
        >
          {/* Green accent top strip */}
          <div style={{ height: '3px', background: 'linear-gradient(90deg, #1bb908, #15960a)' }} />

          <div className="p-5 sm:p-6">
            <p
              className="text-[10px] font-black tracking-[0.18em] uppercase mb-5"
              style={{ color: 'rgba(0,0,0,0.35)' }}
            >
              Route
            </p>

            <ol className="space-y-0">
              {b.stops?.map((stop, i) => {
                const isPickup = stop.type === 'pickup'
                const isLast   = i === (b.stops?.length ?? 0) - 1
                return (
                  <li key={i} className="flex gap-4 relative">
                    {/* Connector line */}
                    {!isLast && (
                      <div
                        className="absolute"
                        style={{
                          left: '15px',
                          top: '32px',
                          bottom: '-8px',
                          width: '2px',
                          background: isPickup
                            ? 'linear-gradient(180deg, #1bb908, rgba(229,28,28,0.3))'
                            : 'rgba(0,0,0,0.08)',
                        }}
                      />
                    )}

                    {/* Icon */}
                    <div
                      className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black mt-0.5 z-10"
                      style={{
                        background: isPickup ? '#1bb908' : '#e51c1c',
                        boxShadow: isPickup
                          ? '0 2px 10px rgba(27,185,8,0.35)'
                          : '0 2px 10px rgba(229,28,28,0.35)',
                      }}
                    >
                      {isPickup ? 'P' : 'D'}
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0 pb-6">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold" style={{ color: '#0d0d0d' }}>
                          {isPickup ? 'Pickup' : 'Drop-off'}
                        </p>
                        {stop.completedAt && (
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(27,185,8,0.1)', color: '#15960a', border: '1px solid rgba(27,185,8,0.15)' }}
                          >
                            ✓ {formatDate(stop.completedAt)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm mt-0.5 flex items-start gap-1.5" style={{ color: 'rgba(0,0,0,0.5)' }}>
                        <MapPin size={12} strokeWidth={2} className="mt-0.5 shrink-0" style={{ color: isPickup ? '#1bb908' : '#e51c1c' }} />
                        {stop.address}
                      </p>
                      {stop.contactName && (
                        <p className="text-xs mt-0.5" style={{ color: 'rgba(0,0,0,0.35)' }}>
                          {stop.contactName}
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>

        {/* ── Footer strip ── */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 pb-6">
          <p className="text-[11px] font-semibold" style={{ color: 'rgba(0,0,0,0.28)' }}>
            GoFastDelivery · Calgary, AB · This page auto-updates in real time.
          </p>
          <Link
            href="/track"
            className="inline-flex items-center gap-1.5 text-[11px] font-bold transition-colors hover:text-green-600"
            style={{ color: 'rgba(0,0,0,0.35)' }}
          >
            <Package size={12} strokeWidth={2.5} />
            Track a different delivery
          </Link>
        </div>
      </div>
    </div>
  )
}
