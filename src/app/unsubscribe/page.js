'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Image from 'next/image'
import { CheckCircle2, AlertCircle } from 'lucide-react'

function UnsubscribeContent() {
  const params = useSearchParams()
  const result = params.get('result')
  const success = result === 'success'

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <Image src="/images/logo.png" alt="Go Fast Delivery Inc." width={120} height={40} className="h-9 w-auto object-contain mx-auto mb-8" />
        <div className="w-14 h-14 rounded-full mx-auto mb-5 flex items-center justify-center"
          style={{ background: success ? 'var(--success-bg)' : 'var(--danger-bg)' }}>
          {success
            ? <CheckCircle2 size={26} style={{ color: 'var(--success)' }} />
            : <AlertCircle size={26} style={{ color: 'var(--danger)' }} />}
        </div>
        {success ? (
          <>
            <h1 className="text-2xl font-black text-foreground mb-2">You&apos;ve been unsubscribed</h1>
            <p className="text-sm text-muted">You will no longer receive marketing emails from Go Fast Delivery Inc.</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-black text-foreground mb-2">Link expired or invalid</h1>
            <p className="text-sm text-muted">This unsubscribe link is no longer valid. Contact us if you continue to receive unwanted emails.</p>
          </>
        )}
      </div>
    </div>
  )
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <UnsubscribeContent />
    </Suspense>
  )
}
