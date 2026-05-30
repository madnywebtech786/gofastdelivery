'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Search, Package, ArrowRight, AlertCircle, Loader2, Truck, X,
} from 'lucide-react'

const TOKEN_RE = /^[A-Za-z0-9_-]{6,32}$/

function clientValidate(token) {
  if (!token) return 'Please enter a tracking number.'
  if (!TOKEN_RE.test(token)) return 'Tracking numbers are 6 to 32 alphanumeric characters (letters, numbers, - and _).'
  return null
}

export default function TrackSearchPage() {
  const router = useRouter()
  const [query,    setQuery]    = useState('')
  const [uiState,  setUiState]  = useState('idle') // idle | loading | not-found | error | rate-limited
  const [errorMsg, setErrorMsg] = useState('')
  const abortRef  = useRef(null)

  const isLoading = uiState === 'loading'
  const isError   = ['error', 'not-found', 'rate-limited'].includes(uiState)

  const doSearch = useCallback(async (token) => {
    const clean = token.trim()

    const validationError = clientValidate(clean)
    if (validationError) {
      setUiState('error')
      setErrorMsg(validationError)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setUiState('loading')
    setErrorMsg('')

    try {
      const res = await fetch(`/api/track/lookup?token=${encodeURIComponent(clean)}`, {
        signal: controller.signal,
        cache: 'no-store',
      })

      if (abortRef.current !== controller) return

      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After') ?? '60'
        setUiState('rate-limited')
        setErrorMsg(`Too many searches. Please wait ${retryAfter} seconds before trying again.`)
        return
      }

      if (!res.ok) {
        const data = await res.json()
        setUiState('not-found')
        setErrorMsg(data.error ?? 'No delivery found for that tracking number.')
        return
      }

      // Valid — redirect then clean up so back-nav shows a fresh form
      setQuery('')
      setUiState('idle')
      router.push(`/track/${encodeURIComponent(clean)}`)
    } catch (err) {
      if (err?.name === 'AbortError') return
      setUiState('error')
      setErrorMsg('Network error. Please check your connection and try again.')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [router])

  function handleSubmit(e) {
    e.preventDefault()
    doSearch(query)
  }

  useEffect(() => () => abortRef.current?.abort(), [])

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: '#faf8f4' }}>

      {/* Background texture */}
      <div className="absolute inset-0 dot-grid-bg pointer-events-none opacity-40" />
      <div className="absolute pointer-events-none"
        style={{ top: '-80px', left: '-80px', width: '450px', height: '450px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(27,185,8,0.1) 0%, transparent 65%)', filter: 'blur(40px)' }} />
      <div className="absolute pointer-events-none"
        style={{ bottom: '-60px', right: '-60px', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,88,13,0.08) 0%, transparent 65%)', filter: 'blur(40px)' }} />

      {/* Info bar */}
      <div style={{ background: '#1bb908', borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-7 flex items-center justify-between">
          <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Calgary&apos;s Same-Day Courier
          </span>
          <span className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.85)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-white opacity-70 inline-block" />
            Live Tracking
          </span>
        </div>
      </div>

      {/* Header */}
      <header style={{ background: '#ffffff', borderBottom: '1px solid rgba(0,0,0,0.07)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/">
            <Image src="/images/logo.png" alt="GoFastDelivery" width={120} height={40}
              className="h-8 w-auto object-contain" priority />
          </Link>
          <Link href="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold transition-colors hover:text-green-600"
            style={{ color: 'rgba(0,0,0,0.4)' }}>
            <ArrowRight size={11} className="rotate-180" />
            GoFastDelivery.ca
          </Link>
        </div>
      </header>

      <main className="relative max-w-lg mx-auto px-4 sm:px-6 pt-12 pb-20">

        {/* Hero */}
        <div className="text-center mb-8">
          <div
            className="inline-flex w-14 h-14 rounded-2xl items-center justify-center mb-5"
            style={{ background: 'rgba(27,185,8,0.08)', border: '1px solid rgba(27,185,8,0.18)' }}
          >
            <Truck size={24} strokeWidth={2} style={{ color: '#1bb908' }} />
          </div>
          <h1
            className="font-black leading-tight tracking-tight mb-2"
            style={{ fontSize: 'clamp(1.8rem, 5vw, 2.5rem)', color: '#0d0d0d', fontFamily: 'var(--font-montserrat, system-ui)' }}
          >
            Track Your Delivery
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(0,0,0,0.45)' }}>
            Enter your tracking number to see the latest status and route.
          </p>
        </div>

        {/* Search card */}
        <form onSubmit={handleSubmit} noValidate className="mb-6">
          <div
            className="rounded-2xl p-5"
            style={{
              background: '#ffffff',
              border: '1px solid rgba(0,0,0,0.07)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
            }}
          >
            {/* Orange accent top strip */}
            <div style={{ height: '3px', background: 'linear-gradient(90deg, #1bb908, #15960a)', borderRadius: '99px', marginBottom: '16px' }} />

            <label
              htmlFor="tracking-input"
              className="block text-[11px] font-black tracking-widest uppercase mb-2"
              style={{ color: 'rgba(0,0,0,0.45)' }}
            >
              Tracking Number
            </label>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search
                  size={14}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: isError ? '#e51c1c' : 'rgba(0,0,0,0.25)' }}
                />
                <input
                  id="tracking-input"
                  type="text"
                  value={query}
                  onChange={e => {
                    setQuery(e.target.value)
                    if (isError) { setUiState('idle'); setErrorMsg('') }
                  }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit(e)}
                  placeholder="e.g. Ztb7iZlQrGcT"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={32}
                  disabled={isLoading}
                  className="w-full outline-none text-sm font-medium transition-all disabled:opacity-60"
                  style={{
                    background: '#faf8f4',
                    border: `1.5px solid ${isError ? '#e51c1c' : 'rgba(0,0,0,0.1)'}`,
                    borderRadius: '10px',
                    color: '#0d0d0d',
                    padding: '0.75rem 2.5rem 0.75rem 2.75rem',
                    fontFamily: 'var(--font-jetbrains-mono), monospace',
                    letterSpacing: '0.04em',
                    boxShadow: isError ? '0 0 0 3px rgba(229,28,28,0.1)' : 'none',
                  }}
                />
                {query && !isLoading && (
                  <button
                    type="button"
                    onClick={() => { setQuery(''); setUiState('idle'); setErrorMsg('') }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-70"
                    style={{ color: 'rgba(0,0,0,0.3)' }}
                    aria-label="Clear"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading || !query.trim()}
                className="flex items-center justify-center gap-2 px-5 rounded-xl font-black text-sm text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #1bb908, #15960a)',
                  boxShadow: '0 4px 16px rgba(27,185,8,0.3)',
                  minWidth: '100px',
                }}
              >
                {isLoading
                  ? <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
                  : <>Track <ArrowRight size={13} /></>
                }
              </button>
            </div>

            {/* Error */}
            {isError && (
              <div
                className="flex items-start gap-2 mt-3 text-xs font-semibold px-3 py-2.5 rounded-xl"
                style={{
                  color: uiState === 'rate-limited' ? '#c43d00' : '#b91c1c',
                  background: uiState === 'rate-limited' ? 'rgba(255,88,13,0.07)' : 'rgba(229,28,28,0.07)',
                  border: `1px solid ${uiState === 'rate-limited' ? 'rgba(255,88,13,0.2)' : 'rgba(229,28,28,0.18)'}`,
                }}
              >
                <AlertCircle size={12} strokeWidth={2.5} className="shrink-0 mt-0.5" />
                {errorMsg}
              </div>
            )}

            <p className="text-[10px] mt-3 leading-relaxed" style={{ color: 'rgba(0,0,0,0.3)' }}>
              Your tracking number is on your booking confirmation email. Also visible in your{' '}
              <Link href="/login" className="font-bold hover:underline" style={{ color: '#1bb908' }}>
                customer account
              </Link>.
            </p>
          </div>
        </form>

        {/* Idle empty state */}
        {uiState === 'idle' && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Package size={28} strokeWidth={1.5} style={{ color: 'rgba(0,0,0,0.12)' }} />
            <p className="text-xs font-medium" style={{ color: 'rgba(0,0,0,0.28)' }}>
              Enter your tracking number above and press Track
            </p>
          </div>
        )}

        {/* Trust strip */}
        <div className="flex items-center justify-center gap-5 mt-8">
          {['Live status updates', '99.2% on-time', 'Calgary-based'].map((t, i) => (
            <span key={t} className="flex items-center gap-1.5 text-[10px] font-semibold"
              style={{ color: 'rgba(0,0,0,0.3)' }}>
              <span className="w-1 h-1 rounded-full inline-block"
                style={{ background: i % 2 === 0 ? '#1bb908' : '#ff580d' }} />
              {t}
            </span>
          ))}
        </div>
      </main>
    </div>
  )
}
