'use client'

import { useState } from 'react'
import { Camera, X, ChevronLeft, ChevronRight } from 'lucide-react'
import Spinner from '@/components/ui/Spinner'

/**
 * "View Photos" trigger + lazy-loaded thumbnail strip + full-screen lightbox.
 * Same lazy-fetch-on-open convention as SignatureViewer — fetches presigned
 * URLs only when opened, never on page render. Unlike SignatureViewer this
 * always needs a `stopType` ('pickup' | 'dropoff') since photos exist on
 * both stop types and the trigger button is visually labeled by which one,
 * so admin/customer can tell proof-of-pickup photos from proof-of-delivery
 * ones at a glance.
 */
export default function PhotoGallery({ bookingId, stopType }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [urls, setUrls] = useState(null)
  const [activeIndex, setActiveIndex] = useState(0)

  async function handleOpen() {
    setOpen(true)
    setError('')
    setActiveIndex(0)
    if (urls) return // already fetched this session — presigned URLs still have time left on their 5-min TTL for a quick re-open
    setLoading(true)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/photos?stopType=${stopType}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Could not load photos')
      }
      const data = await res.json()
      setUrls(data.urls ?? [])
    } catch (err) {
      setError(err.message || 'Could not load photos')
    } finally {
      setLoading(false)
    }
  }

  const label = stopType === 'pickup' ? 'Pickup Photos' : 'Delivery Photos'

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition"
        style={{ color: 'var(--accent)', background: 'var(--accent-dim)' }}
      >
        <Camera size={11} />
        View {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-100 bg-black/90 flex flex-col" onClick={() => setOpen(false)}>
          <div className="px-5 py-3.5 flex items-center justify-between shrink-0" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-white">{label}</h3>
            <button
              onClick={() => setOpen(false)}
              className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center text-white"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 min-h-0 flex items-center justify-center p-4 relative" onClick={(e) => e.stopPropagation()}>
            {loading ? (
              <Spinner size="lg" />
            ) : error ? (
              <p className="text-sm text-center text-white">{error}</p>
            ) : urls && urls.length > 0 ? (
              <>
                <div className="w-full h-full max-w-4xl bg-white rounded-2xl p-4 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote presigned S3 URL, not an app asset next/image can optimize */}
                  <img
                    src={urls[activeIndex]}
                    alt={`${label} ${activeIndex + 1} of ${urls.length}`}
                    className="max-w-full max-h-full w-auto h-auto object-contain"
                  />
                </div>
                {urls.length > 1 && (
                  <>
                    <button
                      onClick={() => setActiveIndex((i) => (i - 1 + urls.length) % urls.length)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center"
                      aria-label="Previous photo"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      onClick={() => setActiveIndex((i) => (i + 1) % urls.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center"
                      aria-label="Next photo"
                    >
                      <ChevronRight size={20} />
                    </button>
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/50 text-white text-xs font-semibold">
                      {activeIndex + 1} / {urls.length}
                    </div>
                  </>
                )}
              </>
            ) : (
              <p className="text-sm text-center text-white">No photos</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
