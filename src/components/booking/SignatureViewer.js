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
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-bold" style={{ color: 'var(--fg)' }}>Delivery Signature</h3>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 flex items-center justify-center min-h-[160px]">
              {loading ? (
                <Spinner size="md" />
              ) : error ? (
                <p className="text-sm text-center" style={{ color: 'var(--danger)' }}>{error}</p>
              ) : url ? (
                /* eslint-disable-next-line @next/next/no-img-element -- remote presigned S3 URL, not an app asset next/image can optimize */
                <img src={url} alt="Customer signature" className="max-w-full h-auto rounded-lg border border-border" />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
