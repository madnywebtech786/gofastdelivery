'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { AlertCircle, ArrowRight, Eye, EyeOff, Zap, Truck, Navigation, Clock } from 'lucide-react'
import Select from '@/components/ui/Select'

const ROLE_DASHBOARDS = {
  admin:    '/admin/dashboard',
  driver:   '/driver/home',
  customer: '/customer/overview',
}

const DEV_ACCOUNTS = [
  { label: 'Driver 1',   email: 'driver1@courier.local',   password: 'Driver@1234' },
  { label: 'Driver 2',   email: 'driver2@courier.local',   password: 'Driver@1234' },
  { label: 'Admin',      email: 'admin@courier.local',     password: 'Admin@1234' },
  { label: 'Customer 1', email: 'customer@courier.local',  password: 'Customer@1234' },
]

const DEV_OPTIONS = DEV_ACCOUNTS.map(a => ({ value: a.email, label: a.label, meta: a.email }))

const STREAKS = [
  { top: '12%', w: '45%', delay: '0s',   dur: '2.8s', op: 0.5 },
  { top: '28%', w: '60%', delay: '0.6s', dur: '3.2s', op: 0.35 },
  { top: '44%', w: '35%', delay: '1.1s', dur: '2.5s', op: 0.55 },
  { top: '60%', w: '50%', delay: '0.3s', dur: '3.5s', op: 0.3 },
  { top: '76%', w: '42%', delay: '0.9s', dur: '2.9s', op: 0.45 },
  { top: '88%', w: '28%', delay: '1.5s', dur: '3.1s', op: 0.25 },
]

const SHIFT_STATS = [
  { icon: Navigation, label: 'Avg Route',    value: '18 km',  color: '#1bb908' },
  { icon: Clock,      label: 'Shift Hours',  value: '8 hrs',  color: '#ff580d' },
  { icon: Truck,      label: 'Daily Drops',  value: '22 avg', color: '#1bb908' },
]

export default function DriverLoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [focused, setFocused]   = useState(null)
  const [mounted, setMounted]   = useState(false)

  useEffect(() => { setMounted(true) }, [])

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
      if (!res.ok) { setError(data.error || 'Invalid credentials.'); return }
      router.replace(ROLE_DASHBOARDS[data.role] ?? '/driver_login')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-stretch"
      style={{ background: '#070a07', fontFamily: 'var(--font-montserrat), system-ui, sans-serif' }}>

      {/* ── Full-bleed speed streaks behind everything ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {STREAKS.map((s, i) => (
          <div key={i} className="absolute left-0" style={{
            top: s.top,
            width: s.w,
            height: '1.5px',
            background: `linear-gradient(90deg, transparent, rgba(27,185,8,${s.op}), transparent)`,
            animation: `streak-drive ${s.dur} linear ${s.delay} infinite`,
          }} />
        ))}
      </div>

      {/* Asphalt texture dots */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.025) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }} />

      {/* ── LEFT: Brand slab ── */}
      <div className="hidden lg:flex flex-col relative overflow-hidden"
        style={{ width: '44%', borderRight: '1px solid rgba(27,185,8,0.12)' }}>

        {/* Green bloom */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at 20% 60%, rgba(27,185,8,0.1) 0%, transparent 55%)',
        }} />

        {/* Diagonal road stripe */}
        <div className="absolute pointer-events-none" style={{
          top: 0, left: '-10%', right: '-10%', bottom: 0,
          background: 'repeating-linear-gradient(105deg, transparent, transparent 60px, rgba(27,185,8,0.025) 60px, rgba(27,185,8,0.025) 61px)',
        }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full px-10 py-10">

          {/* Logo */}
          <Image src="/images/logo.png" alt="GoFastDelivery" width={130} height={44}
            className="h-10 w-auto object-contain rounded-xl mb-auto"
            style={{ background: 'white', padding: '6px 10px' }}
          />

          {/* Big headline — center */}
          <div className="my-auto">
            {/* Truck glyph */}
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8"
              style={{
                background: 'rgba(27,185,8,0.1)',
                border: '2px solid rgba(27,185,8,0.25)',
                boxShadow: '0 0 40px rgba(27,185,8,0.1)',
              }}>
              <Truck size={30} style={{ color: '#1bb908' }} strokeWidth={1.8} />
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5"
              style={{ background: 'rgba(27,185,8,0.1)', border: '1px solid rgba(27,185,8,0.25)' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#1bb908', boxShadow: '0 0 8px #1bb908' }} />
              <span className="text-[9px] font-black tracking-[0.25em] uppercase" style={{ color: '#1bb908' }}>
                Driver Portal · Calgary
              </span>
            </div>

            <h2 className="font-black text-white leading-[0.88] tracking-tighter"
              style={{ fontSize: 'clamp(2.8rem, 5vw, 4.2rem)' }}>
              Time to<br />
              <span style={{
                color: '#1bb908',
                textShadow: '0 0 40px rgba(27,185,8,0.4)',
              }}>Deliver.</span>
            </h2>
            <p className="mt-5 text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.3)', maxWidth: '260px' }}>
              Your route, stops, and updates — everything you need for today's shift in one place.
            </p>
          </div>

          {/* Shift stats row */}
          <div className="flex flex-col gap-3 mt-auto pt-8" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-[9px] font-black tracking-[0.25em] uppercase" style={{ color: 'rgba(255,255,255,0.2)' }}>
              Calgary drivers · avg stats
            </p>
            {SHIFT_STATS.map(({ icon: Icon, label, value, color }, i) => (
              <div key={label} className="flex items-center gap-3"
                style={{
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? 'translateX(0)' : 'translateX(-12px)',
                  transition: `opacity 0.4s ease ${i * 0.1 + 0.3}s, transform 0.4s ease ${i * 0.1 + 0.3}s`,
                }}>
                <Icon size={13} style={{ color }} />
                <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.3)' }}>{label}</span>
                <span className="ml-auto text-xs font-black tabular-nums" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT: Form ── */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-12 py-12 relative">

        {/* Green left-edge line */}
        <div className="absolute inset-y-0 left-0 w-px pointer-events-none"
          style={{ background: 'linear-gradient(180deg, transparent, rgba(27,185,8,0.4) 40%, rgba(27,185,8,0.4) 60%, transparent)' }} />

        {/* Mobile logo */}
        <div className="lg:hidden mb-9">
          <Image src="/images/logo.png" alt="GoFastDelivery" width={120} height={40}
            className="h-9 w-auto object-contain rounded-xl"
            style={{ background: 'white', padding: '4px 8px' }}
          />
        </div>

        <div className="w-full max-w-sm mx-auto">

          {/* Heading */}
          <div className="mb-8"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0)' : 'translateY(20px)',
              transition: 'opacity 0.5s ease 0.1s, transform 0.5s ease 0.1s',
            }}>
            <h1 className="font-black text-white leading-tight tracking-tight"
              style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.4rem)' }}>
              Start Your Shift
            </h1>
            <p className="text-sm mt-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Sign in to see today's deliveries
            </p>
          </div>

          {/* Dev quick-fill */}
          <div className="mb-5 rounded-xl p-3"
            style={{
              background: 'rgba(27,185,8,0.05)',
              border: '1px solid rgba(27,185,8,0.15)',
              opacity: mounted ? 1 : 0,
              transition: 'opacity 0.5s ease 0.2s',
            }}>
            <p className="text-[9px] font-black tracking-[0.25em] uppercase mb-2 flex items-center gap-1.5"
              style={{ color: 'rgba(27,185,8,0.6)' }}>
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
              <label className="text-[9px] font-black tracking-[0.25em] uppercase transition-colors"
                style={{ color: focused === 'email' ? '#1bb908' : 'rgba(255,255,255,0.3)' }}>
                Email
              </label>
              <input
                type="email" autoComplete="email" required
                value={email} onChange={e => setEmail(e.target.value)}
                onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
                placeholder="driver@gofastdelivery.ca"
                className="w-full px-4 py-3.5 rounded-xl text-sm font-medium outline-none transition-all"
                style={{
                  background: focused === 'email' ? 'rgba(27,185,8,0.05)' : 'rgba(255,255,255,0.03)',
                  border: `1.5px solid ${focused === 'email' ? 'rgba(27,185,8,0.5)' : 'rgba(255,255,255,0.07)'}`,
                  color: 'rgba(255,255,255,0.85)',
                  boxShadow: focused === 'email' ? '0 0 0 3px rgba(27,185,8,0.08)' : 'none',
                }}
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-black tracking-[0.25em] uppercase transition-colors"
                style={{ color: focused === 'password' ? '#1bb908' : 'rgba(255,255,255,0.3)' }}>
                Password
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'} autoComplete="current-password" required
                  value={password} onChange={e => setPassword(e.target.value)}
                  onFocus={() => setFocused('password')} onBlur={() => setFocused(null)}
                  placeholder="••••••••"
                  className="w-full px-4 pr-11 py-3.5 rounded-xl text-sm font-medium outline-none transition-all"
                  style={{
                    background: focused === 'password' ? 'rgba(27,185,8,0.05)' : 'rgba(255,255,255,0.03)',
                    border: `1.5px solid ${focused === 'password' ? 'rgba(27,185,8,0.5)' : 'rgba(255,255,255,0.07)'}`,
                    color: 'rgba(255,255,255,0.85)',
                    boxShadow: focused === 'password' ? '0 0 0 3px rgba(27,185,8,0.08)' : 'none',
                  }}
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'rgba(255,255,255,0.25)' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#1bb908'}
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
              className="group relative w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-black text-base text-white mt-2 overflow-hidden transition-all disabled:opacity-60"
              style={{
                background: 'linear-gradient(135deg, #1bb908 0%, #0f8a04 100%)',
                boxShadow: '0 6px 28px rgba(27,185,8,0.35)',
                letterSpacing: '0.03em',
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.boxShadow = '0 8px 40px rgba(27,185,8,0.55)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 6px 28px rgba(27,185,8,0.35)' }}
            >
              {/* Shine */}
              <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.1) 50%, transparent 60%)' }} />
              {loading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  <Truck size={16} strokeWidth={2.2} />
                  Begin Shift
                  <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
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
            <Link href="/admin_login"
              className="flex-1 text-center py-2 rounded-lg text-[11px] font-bold transition-all"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.25)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
            >
              Admin Portal
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes streak-drive {
          0%   { transform: translateX(-110%); opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translateX(200vw); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
