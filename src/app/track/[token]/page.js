import { notFound } from 'next/navigation'
import { findBookingByToken } from '@/lib/db/bookings'
import TrackingClient from './TrackingClient'

export const metadata = { title: 'Track Your Package — SwiftShip' }

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
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="bg-slate-900 text-white px-5 py-4">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div>
            <span className="font-extrabold text-lg tracking-tight">
              Swift<span className="text-blue-400">Ship</span>
            </span>
            <span className="text-slate-400 text-xs ml-2 hidden sm:inline">Courier &amp; Delivery</span>
          </div>
          <span className="text-xs text-slate-400">Live Tracking</span>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-4 py-8 space-y-5">

        {/* Tracking ID */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Tracking ID</p>
          <p className="font-mono font-bold text-2xl text-slate-900 tracking-widest break-all">
            {b.trackingToken}
          </p>
          {b.updatedAt && (
            <p className="text-xs text-slate-400 mt-1">Last updated {formatDate(b.updatedAt)}</p>
          )}
        </div>

        {/* Live status + real-time updates (client component) */}
        <TrackingClient initialBooking={b} />

        {/* Stops */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Route</p>
          <ol className="space-y-4">
            {b.stops?.map((stop, i) => {
              const isPickup = stop.type === 'pickup'
              return (
                <li key={i} className="flex gap-3">
                  <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold mt-0.5 ${isPickup ? 'bg-green-500' : 'bg-red-500'}`}>
                    {isPickup ? 'P' : 'D'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800">
                        {isPickup ? 'Pickup' : 'Drop-off'}
                      </p>
                      {stop.completedAt && (
                        <span className="text-xs bg-green-50 text-green-700 font-semibold px-2 py-0.5 rounded-full">
                          Completed {formatDate(stop.completedAt)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">{stop.address}</p>
                    {stop.contactName && (
                      <p className="text-xs text-slate-400 mt-0.5">{stop.contactName}</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </div>

        <p className="text-center text-xs text-slate-400 pb-4">
          SwiftShip Courier · Calgary, AB · This page auto-updates in real time.
        </p>
      </div>
    </div>
  )
}
