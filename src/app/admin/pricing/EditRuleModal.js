'use client'

import { useState } from 'react'
import { X, Pencil, Loader2 } from 'lucide-react'

/**
 * Edits an existing route rate. City A / City B are shown but locked —
 * they're the rule's identity (which pair this rate applies to); changing
 * either would just create a different rule, not update this one. Only the
 * two dollar amounts are editable. Saves via the same POST /api/pricing/rules
 * upsert the "Add Rate" form uses — passing the unchanged cityA/cityB keeps
 * it targeting this exact rule.
 */
export default function EditRuleModal({ rule, onClose, onSaved }) {
  const [baseRate, setBaseRate] = useState(String(rule.baseRate))
  const [additionalPackageRate, setAdditionalPackageRate] = useState(String(rule.additionalPackageRate))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!baseRate || !additionalPackageRate) {
      setError('Both rates are required.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/pricing/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cityA: rule.cityADisplay,
          cityB: rule.cityBDisplay,
          baseRate: Number(baseRate),
          additionalPackageRate: Number(additionalPackageRate),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to save rate.')
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
            <h2 className="text-base font-bold" style={{ color: 'var(--fg)' }}>Edit Rate</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--fg-3)' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-7 py-6 space-y-5">
          <div className="rounded-lg px-4 py-3 flex items-center justify-between text-sm font-semibold"
            style={{ background: 'var(--surface-2)', color: 'var(--fg)' }}>
            <span>{rule.cityADisplay}</span>
            <span style={{ color: 'var(--fg-3)' }}>↔</span>
            <span>{rule.cityBDisplay}</span>
          </div>
          <p className="text-xs -mt-3" style={{ color: 'var(--fg-3)' }}>
            This rate applies in both directions automatically. To price a different route, add a new rate instead.
          </p>

          {error && (
            <p className="text-xs font-medium px-3 py-2 rounded-lg" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
              {error}
            </p>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>Base Rate (CAD)</label>
            <input
              type="number" min="0" step="0.01" value={baseRate}
              onChange={(e) => setBaseRate(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              style={{ color: 'var(--fg)' }}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>Additional Package Rate (CAD)</label>
            <input
              type="number" min="0" step="0.01" value={additionalPackageRate}
              onChange={(e) => setAdditionalPackageRate(e.target.value)}
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
