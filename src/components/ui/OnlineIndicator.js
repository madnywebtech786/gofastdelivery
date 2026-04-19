'use client'

import { useEffect, useState } from 'react'

/**
 * OnlineIndicator — tiny pill that shows connectivity + pending-sync state.
 *
 * Green dot "Live"    → browser is online
 * Amber  dot "Syncing {n}" → offline-queue has pending items (passed via `pending` prop)
 * Grey   dot "Offline" → browser reports offline
 *
 * Purely presentational — callers pass `pending` (the offline-queue depth).
 */
export default function OnlineIndicator({ pending = 0, className = '' }) {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    if (typeof navigator !== 'undefined') setOnline(navigator.onLine)
    function up()   { setOnline(true) }
    function down() { setOnline(false) }
    window.addEventListener('online',  up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online',  up)
      window.removeEventListener('offline', down)
    }
  }, [])

  let label, dotColor, textColor, bg
  if (!online) {
    label = 'Offline'
    dotColor = '#9ca3af'; textColor = '#374151'; bg = '#f3f4f6'
  } else if (pending > 0) {
    label = `Syncing ${pending}`
    dotColor = '#f59e0b'; textColor = '#78350f'; bg = '#fef3c7'
  } else {
    label = 'Live'
    dotColor = '#10b981'; textColor = '#065f46'; bg = '#d1fae5'
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}
      style={{ background: bg, color: textColor }}
      aria-live="polite"
    >
      <span
        style={{
          width: 7, height: 7, borderRadius: 9999, background: dotColor,
          boxShadow: online && pending === 0 ? '0 0 0 3px rgba(16,185,129,0.2)' : undefined,
        }}
      />
      {label}
    </span>
  )
}
