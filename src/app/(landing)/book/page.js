'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import Image from 'next/image'
import { CheckCircle2, ArrowLeft } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

const BookingForm = dynamic(() => import('@/components/booking/BookingForm'), { ssr: false })

export default function GuestBookPage() {
  const router = useRouter()
  const toast  = useToast()
  const [done, setDone]       = useState(null)
  const [formKey, setFormKey] = useState(0)

  // Reset to form state every time the page is visited
  useEffect(() => {
    setDone(null)
    setFormKey((k) => k + 1)
  }, [])

  function handleSuccess(data) {
    setDone({ trackingToken: data.trackingToken })
    // Replace history entry so back button skips the filled form
    router.replace('/book')
    toast.success('Booking created!', `Tracking #${data.trackingToken}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleBookAnother() {
    setDone(null)
    setFormKey((k) => k + 1) // remount BookingForm — clears all state including the map
  }

  return (
    <div className="min-h-screen bg-background">

      {/* Info bar */}
      <div className="bg-accent border-b border-black/10">
        <div className="max-w-3xl mx-auto px-4 h-7 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-white/85 flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            Guest Profile
          </span>
          <span className="text-[11px] font-semibold text-white/85">No account required</span>
        </div>
      </div>

      {/* Header */}
      <header className="bg-surface border-b border-border shadow-sm sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/">
            <Image src="/images/logo.png" alt="GoFastDelivery" width={120} height={40} className="h-8 w-auto object-contain" priority />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/track" className="text-xs font-semibold text-muted hover:text-foreground transition-colors">
              Track Package
            </Link>
            <Link
              href="/login"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-border text-foreground hover:border-border-2 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">

        {done ? (
          /* ── Success state ───────────────────────────────────────────────── */
          <div className="flex flex-col items-center text-center py-16 gap-6">
            <div className="w-20 h-20 rounded-full bg-green-50 border border-green-200 flex items-center justify-center">
              <CheckCircle2 size={40} className="text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Booking Confirmed!</h1>
              <p className="text-muted mt-2 text-sm">
                Your booking has been placed. Use the tracking number below to follow your delivery.
              </p>
            </div>
            <div className="bg-surface border border-border rounded-2xl px-8 py-6 w-full max-w-sm">
              <p className="text-[10px] font-black tracking-[0.18em] uppercase text-muted mb-2">Tracking Number</p>
              <p className="font-mono font-bold text-2xl text-foreground tracking-widest break-all">
                {done.trackingToken}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
              <button
                onClick={() => router.push('/')}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-accent hover:bg-accent/90 transition-colors"
              >
                Back to Home
              </button>
              <button
                onClick={handleBookAnother}
                className="flex-1 py-3 rounded-xl text-sm font-semibold border border-border text-foreground hover:bg-surface-2 transition-colors"
              >
                Book Another
              </button>
            </div>
            <p className="text-xs text-muted">
              Want to manage all your bookings in one place?{' '}
              <Link href="/register" className="text-accent font-semibold hover:underline">
                Create a free account
              </Link>
            </p>
          </div>
        ) : (
          /* ── Booking form ────────────────────────────────────────────────── */
          <>
            <div className="mb-6">
              <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-secondary font-semibold mb-4 transition-colors">
                <ArrowLeft size={13} /> Back to Home
              </Link>
              <h1 className="text-2xl font-bold text-foreground">Book a Delivery</h1>
              <p className="text-sm text-muted mt-1">
                No account needed. Fill in the details below and we&apos;ll handle the rest.
              </p>
            </div>

            <BookingForm
              key={formKey}
              apiPath="/api/bookings/guest"
              onSuccess={handleSuccess}
            />

            <p className="text-center text-xs text-muted mt-6">
              Have an account?{' '}
              <Link href="/login" className="text-accent font-semibold hover:underline">
                Sign in
              </Link>{' '}
              to manage all your bookings in one place.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
