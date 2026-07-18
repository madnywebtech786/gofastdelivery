'use client'

import { useState } from 'react'
import { X, Pencil, Loader2 } from 'lucide-react'
import Select from '@/components/ui/Select'

const ZONES = [
  { value: 'calgary', label: 'Calgary (hub)' },
  { value: 'satellite', label: 'Satellite' },
  { value: 'regional', label: 'Regional' },
]

/**
 * Edits an existing city's zone. Name is shown but locked — pricing rules
 * reference a city by its name, so renaming it here would orphan every rule
 * that already points at the old name. To rename a city, delete it and add
 * a new one (then re-add its rules).
 */
export default function EditCityModal({ city, onClose, onSaved }) {
  const [zone, setZone] = useState(city.zone)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/pricing/cities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: city.name, zone }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to save city.')
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
            <h2 className="text-base font-bold" style={{ color: 'var(--fg)' }}>Edit City</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--fg-3)' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-7 py-6 space-y-5">
          <div className="rounded-lg px-4 py-3 text-sm font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--fg)' }}>
            {city.name}
          </div>
          <p className="text-xs -mt-3" style={{ color: 'var(--fg-3)' }}>
            To rename a city, delete it and add a new one instead — pricing rates are linked to this name.
          </p>

          {error && (
            <p className="text-xs font-medium px-3 py-2 rounded-lg" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
              {error}
            </p>
          )}

          <Select label="Zone" value={zone} onChange={setZone} options={ZONES} />

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
