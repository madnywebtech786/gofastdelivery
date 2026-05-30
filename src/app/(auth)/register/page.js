'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import {
  Mail, Lock, User, Phone, AlertCircle,
  ArrowRight, Eye, EyeOff, CheckCircle2, Zap,
  Package, Clock, Shield,
} from 'lucide-react'

const RULES = [
  { id: 'len',   label: '8+ characters',    test: p => p.length >= 8 },
  { id: 'upper', label: 'Uppercase letter', test: p => /[A-Z]/.test(p) },
  { id: 'num',   label: 'One number',       test: p => /[0-9]/.test(p) },
]

const PERKS = [
  { icon: Zap,     text: 'Same-day delivery across 8 cities' },
  { icon: Clock,   text: '99.2% on-time rate' },
  { icon: Shield,  text: 'Live status updates on every order' },
  { icon: Package, text: 'No hidden fees, ever' },
]

function validate({ name, email, password, confirmPassword }) {
  const e = {}
  if (!name.trim()) e.name = 'Required'
  if (!email.trim()) e.email = 'Required'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Invalid email'
  if (!password) e.password = 'Required'
  else if (!RULES.every(r => r.test(password))) e.password = 'Password too weak'
  if (password !== confirmPassword) e.confirmPassword = 'Passwords do not match'
  return e
}

function FloatField({ id, label, type = 'text', icon: Icon, value, onChange, focused, setFocused, error, placeholder, autoComplete, right }) {
  const active = focused === id
  const isOrange = active

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id}
        className="text-[11px] font-black tracking-widest uppercase transition-colors"
        style={{ color: active ? '#ff580d' : 'rgba(0,0,0,0.45)' }}>
        {label}
      </label>
      <div className="relative">
        <Icon size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors"
          style={{ color: active ? '#ff580d' : error ? '#ef4444' : 'rgba(0,0,0,0.25)' }} />
        <input
          id={id} name={id} type={type}
          autoComplete={autoComplete}
          required={id !== 'phone'}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(id)}
          onBlur={() => setFocused(null)}
          placeholder={placeholder}
          className="w-full outline-none transition-all text-sm font-medium"
          style={{
            background: active ? '#ffffff' : '#faf8f4',
            border: `1.5px solid ${error ? '#ef4444' : active ? '#ff580d' : 'rgba(0,0,0,0.09)'}`,
            borderRadius: '12px',
            color: '#0d0d0d',
            padding: '0.8rem 1rem 0.8rem 2.75rem',
            paddingRight: right ? '2.75rem' : '1rem',
            boxShadow: error
              ? '0 0 0 3px rgba(239,68,68,0.08)'
              : active
                ? '0 0 0 3px rgba(255,88,13,0.1), 0 2px 12px rgba(255,88,13,0.08)'
                : 'none',
          }}
        />
        {right && <div className="absolute right-3.5 top-1/2 -translate-y-1/2">{right}</div>}
      </div>
      {error && (
        <p className="text-[10px] font-bold flex items-center gap-1" style={{ color: '#ef4444' }}>
          <AlertCircle size={9} strokeWidth={2.5} />{error}
        </p>
      )}
    </div>
  )
}

function StrengthMeter({ password }) {
  if (!password) return null
  const passed = RULES.filter(r => r.test(password)).length
  const color  = ['#ef4444', '#ff580d', '#1bb908'][passed - 1] ?? '#ef4444'
  return (
    <div className="flex flex-col gap-2 mt-1">
      <div className="flex gap-1">
        {RULES.map((_, i) => (
          <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{ background: i < passed ? color : 'rgba(0,0,0,0.08)' }} />
        ))}
      </div>
      <div className="flex gap-4 flex-wrap">
        {RULES.map(r => {
          const ok = r.test(password)
          return (
            <span key={r.id} className="inline-flex items-center gap-1 text-[10px] font-semibold"
              style={{ color: ok ? '#1bb908' : 'rgba(0,0,0,0.3)' }}>
              <CheckCircle2 size={9} strokeWidth={ok ? 3 : 2} />{r.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export default function RegisterPage() {
  const router = useRouter()
  const [fields, setFields]     = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' })
  const [errors, setErrors]     = useState({})
  const [focused, setFocused]   = useState(null)
  const [showPass, setShowPass] = useState(false)
  const [showConf, setShowConf] = useState(false)
  const [serverErr, setServerErr] = useState('')
  const [loading, setLoading]   = useState(false)

  const onChange = useCallback((e) => {
    const { name, value } = e.target
    setFields(p => ({ ...p, [name]: value }))
    setErrors(p => ({ ...p, [name]: undefined }))
    if (serverErr) setServerErr('')
  }, [serverErr])

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate(fields)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setLoading(true); setServerErr('')
    try {
      const res  = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fields.name, email: fields.email, password: fields.password, phone: fields.phone || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setServerErr(data.error || 'Sign-up failed. Please try again.'); return }
      router.replace('/customer/overview')
    } catch {
      setServerErr('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2"
      style={{ background: '#faf8f4' }}>

      {/* ── LEFT: form ── */}
      <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-12 relative overflow-y-auto"
        style={{ background: '#ffffff' }}>

        {/* Top nav */}
        <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
          <Link href="/">
            <Image src="/images/logo.png" alt="GoFastDelivery" width={110} height={36}
              className="h-8 w-auto object-contain" />
          </Link>
          <Link href="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold transition-colors"
            style={{ color: 'rgba(0,0,0,0.35)' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ff580d' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(0,0,0,0.35)' }}>
            <ArrowRight size={11} className="rotate-180" />Back to Home
          </Link>
        </div>

        <div className="w-full max-w-sm mx-auto pt-10">

          {/* Heading */}
          <div className="mb-8">
            <span className="inline-flex px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase mb-4"
              style={{ background: 'rgba(255,88,13,0.1)', color: '#ff580d' }}>
              Free Account
            </span>
            <h1 className="font-black leading-tight tracking-tight mb-2"
              style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.4rem)', color: '#0d0d0d' }}>
              Create your<br />
              <span style={{ color: '#ff580d' }}>GoFast</span> account
            </h1>
            <p className="text-sm" style={{ color: 'rgba(0,0,0,0.4)' }}>
              Already have one?{' '}
              <Link href="/login" className="font-black"
                style={{ color: '#1bb908' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#ff580d' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#1bb908' }}>
                Sign in
              </Link>
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">

            {/* Name + Phone */}
            <div className="grid grid-cols-2 gap-3">
              <FloatField id="name" label="Full Name" icon={User}
                value={fields.name} onChange={onChange}
                focused={focused} setFocused={setFocused}
                error={errors.name} placeholder="Jane Smith"
                autoComplete="name" />
              <FloatField id="phone" label="Phone (opt.)" type="tel" icon={Phone}
                value={fields.phone} onChange={onChange}
                focused={focused} setFocused={setFocused}
                placeholder="+1 (403)…" autoComplete="tel" />
            </div>

            {/* Email */}
            <FloatField id="email" label="Email Address" type="email" icon={Mail}
              value={fields.email} onChange={onChange}
              focused={focused} setFocused={setFocused}
              error={errors.email} placeholder="you@example.com"
              autoComplete="email" />

            {/* Password */}
            <div>
              <FloatField id="password" label="Password"
                type={showPass ? 'text' : 'password'} icon={Lock}
                value={fields.password} onChange={onChange}
                focused={focused} setFocused={setFocused}
                error={errors.password} placeholder="Min 8 chars"
                autoComplete="new-password"
                right={
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    style={{ color: 'rgba(0,0,0,0.3)' }}>
                    {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                } />
              <StrengthMeter password={fields.password} />
            </div>

            {/* Confirm password */}
            <FloatField id="confirmPassword" label="Confirm Password"
              type={showConf ? 'text' : 'password'} icon={Lock}
              value={fields.confirmPassword} onChange={onChange}
              focused={focused} setFocused={setFocused}
              error={errors.confirmPassword} placeholder="Repeat password"
              autoComplete="new-password"
              right={
                <button type="button" onClick={() => setShowConf(v => !v)}
                  style={{ color: 'rgba(0,0,0,0.3)' }}>
                  {showConf ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              } />

            {/* Server error */}
            {serverErr && (
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-semibold"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', color: '#dc2626' }}>
                <AlertCircle size={13} className="shrink-0" />{serverErr}
              </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={loading}
              className="group relative w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl font-black text-sm text-white transition-all disabled:opacity-50 overflow-hidden mt-1"
              style={{ background: 'linear-gradient(135deg, #ff580d, #e04500)', boxShadow: '0 6px 24px rgba(255,88,13,0.3)' }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 10px 32px rgba(255,88,13,0.4)' } }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(255,88,13,0.3)' }}>
              {loading
                ? <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Creating account…</>
                : <>Create Free Account <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" /></>
              }
            </button>

            <p className="text-center text-[10px]" style={{ color: 'rgba(0,0,0,0.3)' }}>
              By signing up you agree to our{' '}
              <span style={{ color: 'rgba(0,0,0,0.5)', fontWeight: 700 }}>Terms</span> &amp;{' '}
              <span style={{ color: 'rgba(0,0,0,0.5)', fontWeight: 700 }}>Privacy Policy</span>
            </p>
          </form>
        </div>
      </div>

      {/* ── RIGHT: brand panel ── */}
      <div className="hidden lg:flex flex-col justify-between relative overflow-hidden p-14"
        style={{ background: '#faf8f4' }}>

        {/* Dot grid texture */}
        <div className="absolute inset-0 dot-grid-bg pointer-events-none opacity-50" />

        {/* Orange blob top-right */}
        <div className="absolute pointer-events-none"
          style={{ top: '-80px', right: '-80px', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,88,13,0.12) 0%, transparent 65%)', filter: 'blur(40px)' }} />
        {/* Green blob bottom-left */}
        <div className="absolute pointer-events-none"
          style={{ bottom: '-60px', left: '-60px', width: '350px', height: '350px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(27,185,8,0.1) 0%, transparent 65%)', filter: 'blur(40px)' }} />

        {/* Top: stat pills */}
        <div className="relative flex items-center gap-3 flex-wrap">
          {[['8000+', 'Deliveries'], ['99.2%', 'On-time'], ['8', 'Cities']].map(([val, lbl], i) => (
            <div key={lbl} className="px-4 py-2.5 rounded-2xl"
              style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
              <p className="text-xl font-black leading-none"
                style={{ color: i % 2 === 0 ? '#ff580d' : '#1bb908' }}>{val}</p>
              <p className="text-[10px] font-semibold uppercase tracking-widest mt-0.5"
                style={{ color: 'rgba(0,0,0,0.35)' }}>{lbl}</p>
            </div>
          ))}
        </div>

        {/* Center: headline */}
        <div className="relative">
          <span className="inline-flex px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase mb-6"
            style={{ background: 'rgba(27,185,8,0.1)', color: '#1bb908' }}>
            Calgary&apos;s #1 Courier
          </span>
          <h2 className="font-black leading-[0.92] tracking-tight mb-6"
            style={{ fontSize: 'clamp(2.8rem, 5vw, 4.5rem)', color: '#0d0d0d' }}>
            Deliver<br />
            <span style={{ color: '#ff580d' }}>anything,</span><br />
            anywhere.
          </h2>
          <p className="text-sm leading-relaxed max-w-xs" style={{ color: 'rgba(0,0,0,0.45)' }}>
            Join thousands of Calgarians who trust GoFastDelivery for same-day, real-time tracked courier service.
          </p>
        </div>

        {/* Bottom: perk list */}
        <div className="relative flex flex-col gap-3">
          {PERKS.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(255,88,13,0.1)', border: '1px solid rgba(255,88,13,0.15)' }}>
                <Icon size={14} strokeWidth={2.2} style={{ color: '#ff580d' }} />
              </div>
              <span className="text-sm font-semibold" style={{ color: 'rgba(0,0,0,0.6)' }}>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
