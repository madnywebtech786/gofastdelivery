'use client'

import { useState } from 'react'
import { X, KeyRound, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react'

export default function ResetPasswordModal({ driverId, driverName, onClose }) {
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [showCf, setShowCf]       = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/drivers/${driverId}/reset-password`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ newPassword: password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to reset password.')
        return
      }
      setSuccess(true)
      setTimeout(onClose, 1800)
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
            <KeyRound size={15} style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-bold" style={{ color: 'var(--fg)' }}>Reset Password</h2>
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
                Password reset successfully for {driverName}.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-xs" style={{ color: 'var(--fg-3)' }}>
                Set a new password for <strong style={{ color: 'var(--fg)' }}>{driverName}</strong>.
                Must be 8+ chars with an uppercase letter, a number, and a special character.
              </p>

              {error && (
                <p className="text-xs font-medium px-3 py-2 rounded-lg"
                  style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                  {error}
                </p>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>New Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-border px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    style={{ color: 'var(--fg)' }}
                    placeholder="Min 8 chars, uppercase, number, symbol"
                  />
                  <button type="button" tabIndex={-1}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--fg-3)' }}
                    onClick={() => setShowPw(v => !v)}>
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--fg-2)' }}>Confirm Password</label>
                <div className="relative">
                  <input
                    type={showCf ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-border px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    style={{ color: 'var(--fg)', borderColor: confirm && confirm !== password ? 'var(--danger)' : '' }}
                    placeholder="Re-enter password"
                  />
                  <button type="button" tabIndex={-1}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--fg-3)' }}
                    onClick={() => setShowCf(v => !v)}>
                    {showCf ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {confirm && confirm !== password && (
                  <p className="text-xs" style={{ color: 'var(--danger)' }}>Passwords do not match.</p>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onClose} disabled={loading}
                  className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold border border-border disabled:opacity-50"
                  style={{ color: 'var(--fg-2)' }}>
                  Cancel
                </button>
                <button type="submit" disabled={loading || !password || password !== confirm}
                  className="flex-1 px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                  style={{ background: 'var(--accent)', color: 'white' }}>
                  {loading ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Reset Password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
