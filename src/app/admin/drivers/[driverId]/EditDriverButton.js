'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Pencil } from 'lucide-react'
import EditDriverModal from './EditDriverModal'

export default function EditDriverButton({ driverId, driver, onSaved }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border border-border"
        style={{ color: 'var(--fg-2)' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        <Pencil size={12} /> Edit Driver
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <EditDriverModal
          driverId={driverId}
          driver={driver}
          onClose={() => setOpen(false)}
          onSaved={onSaved}
        />,
        document.body
      )}
    </>
  )
}
