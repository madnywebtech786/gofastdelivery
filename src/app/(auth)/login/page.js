'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Lock, AlertCircle, LogIn, Zap } from 'lucide-react'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'

const ROLE_DASHBOARDS = {
  admin: '/dashboard',
  driver: '/home',
  customer: '/overview',
}

const DEV_ACCOUNTS = [
  { label: 'Admin',      email: 'admin@courier.local',      password: 'Admin@1234' },
  { label: 'Driver 1',   email: 'driver1@courier.local',    password: 'Driver@1234' },
  { label: 'Driver 2',   email: 'driver2@courier.local',    password: 'Driver@1234' },
  { label: 'Customer 1', email: 'customer@courier.local',   password: 'Customer@1234' },
  { label: 'Customer 2', email: 'customer2@courier.local',  password: 'Customer@1234' },
]

const DEV_OPTIONS = DEV_ACCOUNTS.map((a) => ({
  value: a.email,
  label: a.label,
  meta: a.email,
}))

export default function LoginPage() {
  const router  = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  function fillAccount(emailVal) {
    const account = DEV_ACCOUNTS.find((a) => a.email === emailVal)
    if (account) { setEmail(account.email); setPassword(account.password) }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Login failed. Please check your credentials.'); return }
      router.replace(ROLE_DASHBOARDS[data.role] ?? '/login')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl overflow-hidden anim-fade-up bg-white border border-border shadow-sm">
      {/* Card header */}
      <div className="px-6 py-5 border-b border-border" style={{ background: 'var(--surface-2)' }}>
        <h2 className="text-base font-bold" style={{ color: 'var(--fg)' }}>Sign in to your account</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--fg-3)' }}>Enter your credentials below</p>
      </div>

      <div className="p-6 space-y-5">
        {/* Dev quick-fill */}
        <div className="rounded-lg p-3.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2.5 flex items-center gap-1.5" style={{ color: 'var(--fg-3)' }}>
            <Zap size={10} style={{ color: 'var(--accent)' }} />
            Quick fill (dev)
          </p>
          <Select
            placeholder="Select account…"
            value=""
            onChange={fillAccount}
            options={DEV_OPTIONS}
          />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email address"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            icon={<Mail size={14} />}
          />

          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            icon={<Lock size={14} />}
          />

          {error && (
            <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs"
              style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
              <AlertCircle size={12} className="mt-0.5 shrink-0" />{error}
            </div>
          )}

          <Button type="submit" loading={loading} variant="primary" className="w-full justify-center">
            <LogIn size={14} />
            <span>{loading ? 'Signing in…' : 'Sign in'}</span>
          </Button>
        </form>
      </div>
    </div>
  )
}
