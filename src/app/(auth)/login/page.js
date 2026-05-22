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
  { value: '2,500+', label: 'Deliveries made' },
  { value: '99.2%',  label: 'On-time rate' },
  { value: '12+',    label: 'Communities' },
]

export default function CustomerLoginPage() {
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
    setError('')
    setLoading(true)
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
    <div className="min-h-screen flex" style={{ background: '#fffaf7', fontFamily: 'var(--font-montserrat), system-ui, sans-serif' }}>

      {/* ── LEFT PANEL — brand visual ── */}
      <div
        className="hidden lg:flex flex-col justify-between relative overflow-hidden"
        style={{ width: '48%', background: '#0d0d0d' }}
      >
        {/* Grid overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(255,88,13,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,88,13,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }} />

        {/* Orange bloom */}
        <div className="absolute pointer-events-none" style={{
          bottom: '-100px', right: '-100px',
          width: '500px', height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,88,13,0.18) 0%, transparent 65%)',
          filter: 'blur(40px)',
        }} />
        <div className="absolute pointer-events-none" style={{
          top: '-80px', left: '-80px',
          width: '350px', height: '350px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(27,185,8,0.1) 0%, transparent 65%)',
          filter: 'blur(40px)',
        }} />

        {/* Logo */}
        <div className="relative z-10 p-10">
          <Image src="/images/logo.png" alt="GoFastDelivery" width={140} height={48}
            className="h-11 w-auto object-contain rounded-xl"
            style={{ background: 'white', padding: '6px 10px' }}
          />
        </div>

        {/* Center copy */}
        <div className="relative z-10 px-10 pb-4">
          <div className="mb-6">
            <span className="inline-flex px-3 py-1 rounded-full text-[10px] font-black tracking-[0.2em] uppercase mb-5"
              style={{ background: 'rgba(255,88,13,0.15)', color: '#ff580d' }}>
              Customer Portal
            </span>
            <h2 className="font-black text-white leading-[0.95] tracking-tight"
              style={{ fontSize: 'clamp(2.8rem, 4.5vw, 4rem)' }}>
              Track Every<br />
              <span style={{ color: '#ff580d' }}>Package.</span><br />
              In Real Time.
            </h2>
            <p className="mt-5 text-sm leading-relaxed max-w-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Book pickups, follow your deliveries live, and manage everything from one place.
            </p>
          </div>

          {/* Stats row */}
          <div className="flex gap-8 pt-6 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            {STATS.map(s => (
              <div key={s.label}>
                <p className="text-2xl font-black leading-none" style={{ color: '#ff580d' }}>{s.value}</p>
                <p className="text-[10px] font-semibold mt-1 uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="relative z-10 px-10 pb-10">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#1bb908', boxShadow: '0 0 6px #1bb908' }} />
            <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.25)' }}>
              Calgary &amp; surrounding areas · Mon–Sat 8am–8pm
            </span>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL — form ── */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-12 relative">

        {/* Back to home — top right */}
        <Link
          href="/"
          className="absolute top-6 right-6 flex items-center gap-1.5 text-xs font-bold transition-all group"
          style={{ color: 'rgba(0,0,0,0.35)' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#ff580d' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(0,0,0,0.35)' }}
        >
          <ArrowRight size={12} className="rotate-180 group-hover:-translate-x-0.5 transition-transform" />
          Back to Home
        </Link>

        {/* Mobile logo */}
        <div className="lg:hidden mb-10 flex items-center gap-3">
          <Image src="/images/logo.png" alt="GoFastDelivery" width={120} height={40}
            className="h-9 w-auto object-contain rounded-xl"
            style={{ background: 'white', padding: '4px 8px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}
          />
        </div>

        <div className="w-full max-w-sm mx-auto">

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-3xl font-black tracking-tight" style={{ color: '#0d0d0d' }}>
              Welcome back
            </h1>
            <p className="text-sm mt-1.5" style={{ color: 'rgba(0,0,0,0.4)' }}>
              Sign in to your GoFast account
            </p>
          </div>

          {/* Dev quick-fill */}
          <div className="mb-6 rounded-xl p-3" style={{ background: 'rgba(255,88,13,0.06)', border: '1px solid rgba(255,88,13,0.15)' }}>
            <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2 flex items-center gap-1.5" style={{ color: '#ff580d' }}>
              <Zap size={9} />Dev quick-fill
            </p>
            <Select placeholder="Select account…" value="" onChange={fillAccount} options={DEV_OPTIONS} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-black tracking-widest uppercase" style={{ color: '#0d0d0d' }}>Email</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: focused === 'email' ? '#ff580d' : 'rgba(0,0,0,0.3)' }} />
                <input
                  type="email" autoComplete="email" required
                  value={email} onChange={e => setEmail(e.target.value)}
                  onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm font-medium outline-none transition-all"
                  style={{
                    background: '#fff',
                    border: `1.5px solid ${focused === 'email' ? '#ff580d' : 'rgba(0,0,0,0.1)'}`,
                    color: '#0d0d0d',
                    boxShadow: focused === 'email' ? '0 0 0 3px rgba(255,88,13,0.1)' : 'none',
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-black tracking-widest uppercase" style={{ color: '#0d0d0d' }}>Password</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: focused === 'password' ? '#ff580d' : 'rgba(0,0,0,0.3)' }} />
                <input
                  type={showPass ? 'text' : 'password'} autoComplete="current-password" required
                  value={password} onChange={e => setPassword(e.target.value)}
                  onFocus={() => setFocused('password')} onBlur={() => setFocused(null)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-3 rounded-xl text-sm font-medium outline-none transition-all"
                  style={{
                    background: '#fff',
                    border: `1.5px solid ${focused === 'password' ? '#ff580d' : 'rgba(0,0,0,0.1)'}`,
                    color: '#0d0d0d',
                    boxShadow: focused === 'password' ? '0 0 0 3px rgba(255,88,13,0.1)' : 'none',
                  }}
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2"
                  style={{ color: 'rgba(0,0,0,0.3)' }}>
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 rounded-xl px-3.5 py-3 text-xs font-semibold"
                style={{ background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)', color: '#dc2626' }}>
                <AlertCircle size={13} className="shrink-0" />{error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit" disabled={loading}
              className="group relative w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-black text-sm text-white mt-1 transition-all disabled:opacity-60"
              style={{
                background: loading ? '#ff580d' : 'linear-gradient(135deg, #ff580d, #e04500)',
                boxShadow: '0 6px 24px rgba(255,88,13,0.35)',
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Portal links */}
          <div className="mt-8 pt-6 border-t flex flex-col gap-2" style={{ borderColor: 'rgba(0,0,0,0.07)' }}>
            <p className="text-[10px] font-black tracking-[0.15em] uppercase mb-1" style={{ color: 'rgba(0,0,0,0.3)' }}>Other portals</p>
            <Link href="/admin_login"
              className="flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-bold transition-all group"
              style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)', color: 'rgba(0,0,0,0.5)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.2)'; e.currentTarget.style.color = '#0d0d0d' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.07)'; e.currentTarget.style.color = 'rgba(0,0,0,0.5)' }}
            >
              Admin Portal <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link href="/driver_login"
              className="flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-bold transition-all group"
              style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)', color: 'rgba(0,0,0,0.5)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.2)'; e.currentTarget.style.color = '#0d0d0d' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.07)'; e.currentTarget.style.color = 'rgba(0,0,0,0.5)' }}
            >
              Driver Portal <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
