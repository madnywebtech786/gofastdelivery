'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { AlertCircle, ArrowRight, Eye, EyeOff, Zap, Shield, BarChart2, Users, Package } from 'lucide-react'
import Select from '@/components/ui/Select'

const ROLE_DASHBOARDS = {
  admin:    '/admin/dashboard',
  driver:   '/driver/home',
  customer: '/customer/overview',
}

const DEV_ACCOUNTS = [
  { label: 'Admin',      email: 'admin@courier.local',     password: 'Admin@1234' },
  { label: 'Driver 1',   email: 'driver1@courier.local',   password: 'Driver@1234' },
  { label: 'Customer 1', email: 'customer@courier.local',  password: 'Customer@1234' },
]

const DEV_OPTIONS = DEV_ACCOUNTS.map(a => ({ value: a.email, label: a.label, meta: a.email }))

function useCountUp(target, duration = 1800, start = false) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!start) return
    let startTime = null
    const step = (ts) => {
      if (!startTime) startTime = ts
      const progress = Math.min((ts - startTime) / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3)
      setVal(Math.floor(ease * target))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [start, target, duration])
  return val
}

const METRICS = [
  { icon: Package,   label: 'Active Bookings',  value: 47,    suffix: '',   color: '#ff580d' },
  { icon: Users,     label: 'Drivers On Road',  value: 12,    suffix: '',   color: '#1bb908' },
  { icon: BarChart2, label: 'Deliveries Today', value: 134,   suffix: '',   color: '#ff580d' },
  { icon: Shield,    label: 'On-Time Rate',     value: 99,    suffix: '%',  color: '#1bb908' },
]

function MetricCard({ metric, index, animate }) {
  const count = useCountUp(metric.value, 1600 + index * 200, animate)
  const Icon = metric.icon
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        opacity: animate ? 1 : 0,
        transform: animate ? 'translateY(0)' : 'translateY(12px)',
        transition: `opacity 0.5s ease ${index * 0.1 + 0.3}s, transform 0.5s ease ${index * 0.1 + 0.3}s`,
      }}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${metric.color}18`, border: `1px solid ${metric.color}30` }}>
        <Icon size={14} style={{ color: metric.color }} strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>{metric.label}</p>
        <p className="text-lg font-black leading-tight tabular-nums" style={{ color: metric.color }}>
          {count}{metric.suffix}
        </p>
      </div>
      {/* Micro sparkline bar */}
      <div className="w-10 h-5 flex items-end gap-px shrink-0">
        {[40, 65, 50, 80, 60, 90, 75].map((h, i) => (
          <div key={i} className="flex-1 rounded-sm" style={{
            height: `${animate ? h : 0}%`,
            background: metric.color,
            opacity: 0.3 + (i / 7) * 0.4,
            transition: `height 0.6s ease ${index * 0.1 + i * 0.06}s`,
          }} />
        ))}
      </div>
    </div>
  )
}

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [focused, setFocused]   = useState(null)
  const [mounted, setMounted]   = useState(false)
  const [time, setTime]         = useState('')

  useEffect(() => {
    setMounted(true)
    const tick = () => setTime(new Date().toLocaleTimeString('en-CA', { hour12: false }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

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
      if (!res.ok) { setError(data.error || 'Access denied.'); return }
      router.replace(ROLE_DASHBOARDS[data.role] ?? '/admin_login')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex" style={{
      background: '#080c14',
      fontFamily: 'var(--font-montserrat), system-ui, sans-serif',
    }}>

      {/* ── LEFT: Control Room Panel ── */}
      <div className="hidden lg:flex flex-col relative overflow-hidden"
        style={{ width: '42%', background: 'linear-gradient(160deg, #0b1120 0%, #070b15 100%)', borderRight: '1px solid rgba(255,255,255,0.05)' }}>

        {/* Geometric grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(255,88,13,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,88,13,0.05) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />

        {/* Corner accent — top right diagonal slash */}
        <div className="absolute top-0 right-0 w-40 h-40 pointer-events-none overflow-hidden">
          <div style={{
            position: 'absolute', top: 0, right: 0,
            width: '160px', height: '3px',
            background: 'linear-gradient(90deg, transparent, #ff580d)',
            transform: 'rotate(45deg) translate(30px, -10px)',
            transformOrigin: 'right',
          }} />
        </div>

        {/* Orange top glow */}
        <div className="absolute top-0 left-0 right-0 h-64 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at 30% 0%, rgba(255,88,13,0.12) 0%, transparent 60%)',
        }} />

        {/* Top bar */}
        <div className="relative z-10 flex items-center justify-between px-8 pt-8 pb-6"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <Image src="/images/logo.png" alt="GoFastDelivery" width={120} height={40}
            className="h-9 w-auto object-contain rounded-lg"
            style={{ background: 'white', padding: '4px 8px' }}
          />
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#1bb908', boxShadow: '0 0 6px #1bb908' }} />
            <span className="text-[11px] font-black tabular-nums"
              style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-jetbrains-mono, monospace)', letterSpacing: '0.08em' }}>
              {time}
            </span>
          </div>
        </div>

        {/* Platform label */}
        <div className="relative z-10 px-8 pt-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg mb-5"
            style={{ background: 'rgba(255,88,13,0.1)', border: '1px solid rgba(255,88,13,0.2)' }}>
            <Shield size={10} style={{ color: '#ff580d' }} />
            <span className="text-[9px] font-black tracking-[0.25em] uppercase" style={{ color: '#ff580d' }}>
              Control Panel
            </span>
          </div>

          <h2 className="font-black leading-[0.9] tracking-tight text-white"
            style={{ fontSize: 'clamp(2rem, 3.5vw, 2.8rem)' }}>
            GoFast<br />
            <span style={{
              WebkitTextStroke: '1.5px rgba(255,88,13,0.6)',
              color: 'transparent',
            }}>Admin</span><br />
            Dashboard
          </h2>
          <p className="mt-4 text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.3)', maxWidth: '240px' }}>
            Full operational control — bookings, drivers, pricing, and real-time delivery oversight.
          </p>
        </div>

        {/* Live metrics */}
        <div className="relative z-10 px-8 pt-8 flex flex-col gap-2.5">
          <p className="text-[9px] font-black tracking-[0.25em] uppercase mb-1"
            style={{ color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
            ▸ Live Platform Stats
          </p>
          {METRICS.map((m, i) => (
            <MetricCard key={m.label} metric={m} index={i} animate={mounted} />
          ))}
        </div>

        {/* Bottom rule */}
        <div className="relative z-10 mt-auto px-8 pb-8 pt-6">
          <div className="h-px mb-5" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.15)', fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
            GoFastDelivery Admin Panel · v2.0<br />
            Authorized access only
          </p>
        </div>
      </div>

      {/* ── RIGHT: Form ── */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-14 py-12 relative"
        style={{ background: '#0d1018' }}>

        {/* Subtle diagonal accent line */}
        <div className="absolute top-0 bottom-0 left-0 w-px pointer-events-none"
          style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(255,88,13,0.2) 40%, rgba(255,88,13,0.2) 60%, transparent 100%)' }} />

        {/* Mobile logo */}
        <div className="lg:hidden mb-8 flex items-center justify-between">
          <Image src="/images/logo.png" alt="GoFastDelivery" width={110} height={36}
            className="h-8 w-auto object-contain rounded-lg"
            style={{ background: 'white', padding: '4px 8px' }}
          />
          <span className="text-[10px] font-black tabular-nums"
            style={{ color: 'rgba(255,88,13,0.5)', fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
            {time}
          </span>
        </div>

        <div className="w-full max-w-sm mx-auto">

          {/* Heading */}
          <div className="mb-8"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0)' : 'translateY(20px)',
              transition: 'opacity 0.5s ease 0.1s, transform 0.5s ease 0.1s',
            }}>
            <h1 className="text-3xl font-black text-white tracking-tight leading-tight">
              Secure<br />Sign In
            </h1>
            <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-jetbrains-mono, monospace)' }}>
              Restricted · Administrators only
            </p>
          </div>

          {/* Dev quick-fill */}
          <div className="mb-5 rounded-xl p-3"
            style={{
              background: 'rgba(255,88,13,0.05)',
              border: '1px solid rgba(255,88,13,0.15)',
              opacity: mounted ? 1 : 0,
              transition: 'opacity 0.5s ease 0.2s',
            }}>
            <p className="text-[9px] font-black tracking-[0.25em] uppercase mb-2 flex items-center gap-1.5"
              style={{ color: 'rgba(255,88,13,0.6)' }}>
              <Zap size={8} />Dev accounts
            </p>
            <Select placeholder="Select account…" value="" onChange={fillAccount} options={DEV_OPTIONS} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0)' : 'translateY(16px)',
              transition: 'opacity 0.5s ease 0.25s, transform 0.5s ease 0.25s',
            }}>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-black tracking-[0.25em] uppercase"
                style={{ color: focused === 'email' ? '#ff580d' : 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-jetbrains-mono, monospace)', transition: 'color 0.2s' }}>
                Admin Email
              </label>
              <input
                type="email" autoComplete="email" required
                value={email} onChange={e => setEmail(e.target.value)}
                onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
                placeholder="admin@gofastdelivery.ca"
                className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-all"
                style={{
                  background: focused === 'email' ? 'rgba(255,88,13,0.05)' : 'rgba(255,255,255,0.03)',
                  border: `1.5px solid ${focused === 'email' ? 'rgba(255,88,13,0.5)' : 'rgba(255,255,255,0.07)'}`,
                  color: 'rgba(255,255,255,0.85)',
                  fontSize: '13px',
                  boxShadow: focused === 'email' ? '0 0 0 3px rgba(255,88,13,0.08)' : 'none',
                }}
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-black tracking-[0.25em] uppercase"
                style={{ color: focused === 'password' ? '#ff580d' : 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-jetbrains-mono, monospace)', transition: 'color 0.2s' }}>
                Passphrase
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'} autoComplete="current-password" required
                  value={password} onChange={e => setPassword(e.target.value)}
                  onFocus={() => setFocused('password')} onBlur={() => setFocused(null)}
                  placeholder="••••••••••••"
                  className="w-full px-4 pr-11 py-3.5 rounded-xl text-sm outline-none transition-all"
                  style={{
                    background: focused === 'password' ? 'rgba(255,88,13,0.05)' : 'rgba(255,255,255,0.03)',
                    border: `1.5px solid ${focused === 'password' ? 'rgba(255,88,13,0.5)' : 'rgba(255,255,255,0.07)'}`,
                    color: 'rgba(255,255,255,0.85)',
                    fontSize: '13px',
                    boxShadow: focused === 'password' ? '0 0 0 3px rgba(255,88,13,0.08)' : 'none',
                  }}
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'rgba(255,255,255,0.25)' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#ff580d'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl px-3.5 py-3 text-xs font-semibold"
                style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', color: '#f87171' }}>
                <AlertCircle size={13} className="shrink-0" />{error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit" disabled={loading}
              className="group relative w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-black text-sm text-white mt-1 overflow-hidden transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #ff580d 0%, #c73d00 100%)', boxShadow: '0 6px 28px rgba(255,88,13,0.3)' }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.boxShadow = '0 8px 36px rgba(255,88,13,0.5)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 6px 28px rgba(255,88,13,0.3)' }}
            >
              {/* Shine sweep */}
              <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 50%, transparent 60%)' }} />
              {loading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Authenticating…
                </>
              ) : (
                <>
                  <Shield size={14} strokeWidth={2.5} />
                  Access Dashboard
                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Portal links */}
          <div className="mt-7 pt-6 flex gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <Link href="/login"
              className="flex-1 text-center py-2 rounded-lg text-[11px] font-bold transition-all"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.25)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
            >
              Customer Portal
            </Link>
            <Link href="/driver_login"
              className="flex-1 text-center py-2 rounded-lg text-[11px] font-bold transition-all"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.25)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
            >
              Driver Portal
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
