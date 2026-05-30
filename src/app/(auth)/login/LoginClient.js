'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Mail, Lock, AlertCircle, ArrowRight, Eye, EyeOff, Zap } from 'lucide-react'
import Select from '@/components/ui/Select'

const ROLE_DASHBOARDS = {
  admin:    '/admin/dashboard',
  driver:   '/driver/home',
  customer: '/customer/overview',
}

const DEV_ACCOUNTS = [
  { label: 'Admin',      email: 'admin@courier.local',     password: 'Admin@1234' },
  { label: 'Driver 1',   email: 'driver1@courier.local',   password: 'Driver@1234' },
  { label: 'Driver 2',   email: 'driver2@courier.local',   password: 'Driver@1234' },
  { label: 'Customer 1', email: 'customer@courier.local',  password: 'Customer@1234' },
  { label: 'Customer 2', email: 'customer2@courier.local', password: 'Customer@1234' },
]
const DEV_OPTIONS = DEV_ACCOUNTS.map(a => ({ value: a.email, label: a.label, meta: a.email }))

const STATS = [
  { value: '8000+', label: 'Deliveries made', accent: '#ff580d' },
  { value: '99.2%', label: 'On-time rate',    accent: '#1bb908' },
  { value: '8',     label: 'Cities served',   accent: '#ff580d' },
]

export default function LoginClient() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [focused, setFocused]   = useState(null)

  function fillAccount(emailVal) {
    const a = DEV_ACCOUNTS.find(a => a.email === emailVal)
    if (a) { setEmail(a.email); setPassword(a.password) }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Invalid credentials. Please try again.'); return }
      router.replace(ROLE_DASHBOARDS[data.role] ?? '/login')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2"
      style={{ background: '#faf8f4' }}>

      {/* ── LEFT: brand panel ── */}
      <div className="hidden lg:flex flex-col justify-between relative overflow-hidden p-14"
        style={{ background: '#faf8f4' }}>
        <div className="absolute inset-0 dot-grid-bg pointer-events-none opacity-50" />
        <div className="absolute pointer-events-none"
          style={{ top: '-80px', left: '-80px', width: '450px', height: '450px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,88,13,0.12) 0%, transparent 65%)', filter: 'blur(40px)' }} />
        <div className="absolute pointer-events-none"
          style={{ bottom: '-60px', right: '-60px', width: '350px', height: '350px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(27,185,8,0.09) 0%, transparent 65%)', filter: 'blur(40px)' }} />

        <div className="relative">
          <Image src="/images/logo.png" alt="GoFastDelivery" width={130} height={44}
            className="h-10 w-auto object-contain" />
        </div>

        <div className="relative">
          <span className="inline-flex px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase mb-6"
            style={{ background: 'rgba(255,88,13,0.1)', color: '#ff580d' }}>
            Customer Portal
          </span>
          <h2 className="font-black leading-[0.92] tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.8rem, 5vw, 4.5rem)', color: '#0d0d0d' }}>
            Track Every<br />
            <span style={{ color: '#ff580d' }}>Package.</span><br />
            In Real Time.
          </h2>
          <p className="text-sm leading-relaxed max-w-xs" style={{ color: 'rgba(0,0,0,0.45)' }}>
            Book pickups, follow your deliveries live, and manage everything from one place.
          </p>
        </div>

        <div className="relative grid grid-cols-3 gap-4">
          {STATS.map(s => (
            <div key={s.label} className="flex flex-col gap-1 p-4 rounded-2xl"
              style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
              <span className="text-2xl font-black leading-none" style={{ color: s.accent }}>{s.value}</span>
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(0,0,0,0.35)' }}>{s.label}</span>
            </div>
          ))}
        </div>

        <div className="relative flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{ background: '#1bb908', animation: 'ping 1.4s cubic-bezier(0,0,0.2,1) infinite' }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#1bb908' }} />
          </span>
          <span className="text-xs font-semibold" style={{ color: 'rgba(0,0,0,0.4)' }}>
            Drivers on route now · Calgary &amp; surrounding areas
          </span>
        </div>
      </div>

      {/* ── RIGHT: form ── */}
      <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-12 relative"
        style={{ background: '#ffffff' }}>

        <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
          <div className="lg:hidden">
            <Image src="/images/logo.png" alt="GoFastDelivery" width={100} height={32}
              className="h-7 w-auto object-contain" />
          </div>
          <div className="hidden lg:block" />
          <Link href="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold transition-colors"
            style={{ color: 'rgba(0,0,0,0.35)' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ff580d' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(0,0,0,0.35)' }}>
            <ArrowRight size={11} className="rotate-180" />Back to Home
          </Link>
        </div>

        <div className="w-full max-w-sm mx-auto pt-6">
          <div className="mb-8">
            <h1 className="font-black leading-tight tracking-tight mb-2"
              style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.4rem)', color: '#0d0d0d' }}>
              Welcome back
            </h1>
            <p className="text-sm" style={{ color: 'rgba(0,0,0,0.4)' }}>
              No account?{' '}
              <Link href="/register" className="font-black"
                style={{ color: '#1bb908' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#ff580d' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#1bb908' }}>
                Create one free
              </Link>
            </p>
          </div>

          <div className="mb-6 rounded-2xl p-3.5"
            style={{ background: 'rgba(255,88,13,0.05)', border: '1px solid rgba(255,88,13,0.12)' }}>
            <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2 flex items-center gap-1.5"
              style={{ color: '#ff580d' }}>
              <Zap size={9} />Dev quick-fill
            </p>
            <Select placeholder="Select account…" value="" onChange={fillAccount} options={DEV_OPTIONS} />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email"
                className="text-[11px] font-black tracking-widest uppercase transition-colors"
                style={{ color: focused === 'email' ? '#ff580d' : 'rgba(0,0,0,0.45)' }}>
                Email
              </label>
              <div className="relative">
                <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: focused === 'email' ? '#ff580d' : 'rgba(0,0,0,0.25)', transition: 'color 0.2s' }} />
                <input id="email" type="email" autoComplete="email" required
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                  onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
                  placeholder="you@example.com"
                  className="w-full outline-none transition-all text-sm font-medium"
                  style={{
                    background: focused === 'email' ? '#ffffff' : '#faf8f4',
                    border: `1.5px solid ${focused === 'email' ? '#ff580d' : 'rgba(0,0,0,0.09)'}`,
                    borderRadius: '12px', color: '#0d0d0d',
                    padding: '0.8rem 1rem 0.8rem 2.75rem',
                    boxShadow: focused === 'email' ? '0 0 0 3px rgba(255,88,13,0.1), 0 2px 12px rgba(255,88,13,0.08)' : 'none',
                  }} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password"
                className="text-[11px] font-black tracking-widest uppercase transition-colors"
                style={{ color: focused === 'password' ? '#ff580d' : 'rgba(0,0,0,0.45)' }}>
                Password
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: focused === 'password' ? '#ff580d' : 'rgba(0,0,0,0.25)', transition: 'color 0.2s' }} />
                <input id="password" type={showPass ? 'text' : 'password'}
                  autoComplete="current-password" required
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  onFocus={() => setFocused('password')} onBlur={() => setFocused(null)}
                  placeholder="••••••••"
                  className="w-full outline-none transition-all text-sm font-medium"
                  style={{
                    background: focused === 'password' ? '#ffffff' : '#faf8f4',
                    border: `1.5px solid ${focused === 'password' ? '#ff580d' : 'rgba(0,0,0,0.09)'}`,
                    borderRadius: '12px', color: '#0d0d0d',
                    padding: '0.8rem 2.75rem 0.8rem 2.75rem',
                    boxShadow: focused === 'password' ? '0 0 0 3px rgba(255,88,13,0.1), 0 2px 12px rgba(255,88,13,0.08)' : 'none',
                  }} />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2"
                  style={{ color: 'rgba(0,0,0,0.3)' }}>
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-semibold"
                style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.18)', color: '#dc2626' }}>
                <AlertCircle size={13} className="shrink-0" />{error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="group w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl font-black text-sm text-white transition-all disabled:opacity-50 overflow-hidden mt-1"
              style={{ background: 'linear-gradient(135deg, #ff580d, #e04500)', boxShadow: '0 6px 24px rgba(255,88,13,0.3)' }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 10px 32px rgba(255,88,13,0.4)' } }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(255,88,13,0.3)' }}>
              {loading
                ? <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Signing in…</>
                : <>Sign In <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" /></>
              }
            </button>
          </form>

          <div className="mt-8 pt-6 flex flex-col gap-2"
            style={{ borderTop: '1px solid rgba(0,0,0,0.07)' }}>
            <p className="text-[10px] font-black tracking-widest uppercase mb-1"
              style={{ color: 'rgba(0,0,0,0.3)' }}>Other portals</p>
            {[
              { href: '/admin_login',  label: 'Admin Portal' },
              { href: '/driver_login', label: 'Driver Portal' },
            ].map(p => (
              <Link key={p.href} href={p.href}
                className="flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-bold transition-all group"
                style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)', color: 'rgba(0,0,0,0.45)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.18)'; e.currentTarget.style.color = '#0d0d0d' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.07)'; e.currentTarget.style.color = 'rgba(0,0,0,0.45)' }}>
                {p.label}
                <ArrowRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
