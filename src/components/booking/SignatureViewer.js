'use client'

import { useState } from 'react'
import { PenTool, X } from 'lucide-react'
import Spinner from '@/components/ui/Spinner'

/**
 * "View Signature" trigger + lazy-loaded lightbox modal. Fetches a fresh
 * presigned URL only when opened — never on page render, since most
 * bookings' signatures are never actually viewed. Shared by the customer
 * and admin booking-detail pages (same auth-checked endpoint enforces who
 * may actually retrieve the URL; this component has no role awareness).
 */
export default function SignatureViewer({ bookingId }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [url, setUrl] = useState(null)
  const [signerName, setSignerName] = useState(null)

  async function handleOpen() {
    setOpen(true)
    setError('')
    if (url) return // already fetched this session — presigned URL still has time left on its 5-min TTL for a quick re-open
    setLoading(true)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/signature`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Could not load signature')
      }
      const data = await res.json()
      setUrl(data.url)
      setSignerName(data.signerName ?? null)
    } catch (err) {
      setError(err.message || 'Could not load signature')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition"
        style={{ color: 'var(--accent)', background: 'var(--accent-dim)' }}
      >
        <PenTool size={11} />
        View Signature
      </button>

      {open && (
        // Full-screen, not a small centered card — a signature's natural
        // shape (very wide relative to its height, from getTrimmedCanvas())
        // needs the whole viewport to display at a readable size without
        // scrolling. Header is pinned via flex-column + shrink-0; the image
        // area gets 100% of the remaining space and the image is fitted
        // (not cropped) inside it via object-contain, so it's shown as
        // large as possible while always fitting on screen at once.
        <div className="fixed inset-0 z-100 bg-black/90 flex flex-col" onClick={() => setOpen(false)}>
          <div className="px-5 py-3.5 flex items-center justify-between shrink-0" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-white">Delivery Signature</h3>
            <button
              onClick={() => setOpen(false)}
              className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center text-white"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center p-4">
            {loading ? (
              <Spinner size="lg" />
            ) : error ? (
              <p className="text-sm text-center text-white">{error}</p>
            ) : url ? (
              // object-contain inside a sized bg-white card: fits the full
              // image within the available space with no cropping and no
              // scrolling, at whatever size that space allows — never
              // stretched, never clipped.
              <div className="w-full h-full max-w-4xl bg-white rounded-2xl p-4 flex flex-col items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
                {/* eslint-disable-next-line @next/next/no-img-element -- remote presigned S3 URL, not an app asset next/image can optimize */}
                <img src={url} alt="Customer signature" className="max-w-full flex-1 min-h-0 w-auto h-auto object-contain" />
                {signerName && (
                  <p className="text-sm font-semibold shrink-0" style={{ color: 'var(--fg)' }}>Signed by: {signerName}</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  )
}
