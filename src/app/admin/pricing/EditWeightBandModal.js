'use client'

import { useState } from 'react'
import { X, Pencil, Loader2 } from 'lucide-react'

/**
 * Edits an existing weight range. All three fields are editable (unlike
 * EditRuleModal's locked city pair) — a range has no other identity to
 * preserve, so min/max/rate can all change freely. Saves via the same
 * POST /api/pricing/weight-bands upsert the "Add Weight Range" form uses,
 * with `id` set so it targets this row instead of inserting a new one.
 */
export default function EditWeightBandModal({ band, onClose, onSaved }) {
  const [minLbs, setMinLbs] = useState(String(band.minLbs))
  const [maxLbs, setMaxLbs] = useState(String(band.maxLbs))
  const [rate, setRate]     = useState(String(band.rate))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (minLbs === '' || maxLbs === '' || rate === '') {
      setError('Min weight, max weight, and rate are all required.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/pricing/weight-bands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: band._id,
          minLbs: Number(minLbs),
          maxLbs: Number(maxLbs),
          rate: Number(rate),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to save weight range.')
        return
      }
      onSaved()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-7 py-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Pencil size={16} style={{ color: 'var(--accent)' }} />
            <h2 className="text-base font-bold" style={{ color: 'var(--fg)' }}>Edit Weight Range</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--fg-3)' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-7 py-6 space-y-5">
          {error && (
            <p className="text-xs font-medium px-3 py-2 rounded-lg" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
              {error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>Min Weight (lbs)</label>
              <input
                type="number" min="0" step="0.1" value={minLbs}
                onChange={(e) => setMinLbs(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                style={{ color: 'var(--fg)' }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>Max Weight (lbs)</label>
              <input
                type="number" min="0" step="0.1" value={maxLbs}
                onChange={(e) => setMaxLbs(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                style={{ color: 'var(--fg)' }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>Rate (CAD)</label>
            <input
              type="number" min="0" step="0.01" value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              style={{ color: 'var(--fg)' }}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border border-border disabled:opacity-50"
              style={{ color: 'var(--fg-2)' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              style={{ background: 'var(--accent)', color: 'white' }}>
              {loading ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
