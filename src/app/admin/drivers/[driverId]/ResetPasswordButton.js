'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { KeyRound } from 'lucide-react'
import ResetPasswordModal from './ResetPasswordModal'

export default function ResetPasswordButton({ driverId, driverName }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
        style={{ background: '#1bb908', color: 'white' }}
        onMouseEnter={e => { e.currentTarget.style.background = '#17a006' }}
        onMouseLeave={e => { e.currentTarget.style.background = '#1bb908' }}
      >
        <KeyRound size={12} /> Reset Password
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <ResetPasswordModal
          driverId={driverId}
          driverName={driverName}
          onClose={() => setOpen(false)}
        />,
        document.body
      )}
    </>
  )
}
