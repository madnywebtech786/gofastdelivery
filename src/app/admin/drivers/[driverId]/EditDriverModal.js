'use client'

import { useState } from 'react'
import { X, Pencil, Loader2, CheckCircle2 } from 'lucide-react'

export default function EditDriverModal({ driverId, driver, onClose, onSaved }) {
  const [name, setName]   = useState(driver.name ?? '')
  const [email, setEmail] = useState(driver.email ?? '')
  const [phone, setPhone] = useState(driver.phone ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/drivers/${driverId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to update driver.')
        return
      }
      setSuccess(true)
      setTimeout(() => { onSaved(); onClose() }, 1200)
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
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Pencil size={15} style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-bold" style={{ color: 'var(--fg)' }}>Edit Driver</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: 'var(--fg-3)' }}>
            <X size={15} />
          </button>
        </div>

        <div className="px-6 py-5">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle2 size={36} style={{ color: '#16a34a' }} />
              <p className="text-sm font-semibold text-center" style={{ color: 'var(--fg)' }}>
                Driver info updated.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <p className="text-xs font-medium px-3 py-2 rounded-lg"
                  style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                  {error}
                </p>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{ color: 'var(--fg)' }}
                  placeholder="Driver name"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{ color: 'var(--fg)' }}
                  placeholder="driver@example.com"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  style={{ color: 'var(--fg)' }}
                  placeholder="+1 403-000-0000 (optional)"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onClose} disabled={loading}
                  className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold border border-border disabled:opacity-50"
                  style={{ color: 'var(--fg-2)' }}>
                  Cancel
                </button>
                <button type="submit" disabled={loading || !name.trim() || !email.trim()}
                  className="flex-1 px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                  style={{ background: 'var(--accent)', color: 'white' }}>
                  {loading ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Save Changes'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
