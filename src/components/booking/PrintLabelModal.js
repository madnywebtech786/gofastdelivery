'use client'

import { Printer, FileText } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { triggerLabelPrint } from './BookingLabel'

/**
 * Shipping-label print dialog, shared by the two places a customer can reach
 * it: right after a booking is created (BookingForm) and later from the
 * booking detail page. Both get the same two page-size choices.
 */
export default function PrintLabelModal({
  open,
  onClose,
  booking,
  title = 'Print shipping label',
  subtitle = 'Print the label and attach it to your package.',
}) {
  const toast = useToast()

  function print(mode) {
    if (!triggerLabelPrint(booking, mode)) {
      toast.error(
        'Could not open the print window',
        'Your browser blocked the popup. Allow popups for this site, then try again.',
      )
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <div
          className="rounded-xl px-4 py-3"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--fg-3)' }}>
            Tracking ID
          </p>
          <p
            className="font-mono font-black text-lg break-all select-all mt-0.5"
            style={{ color: 'var(--fg)', letterSpacing: '0.08em' }}
          >
            {booking?.trackingToken ?? '—'}
          </p>
        </div>

        <p className="text-sm" style={{ color: 'var(--fg-2)' }}>{subtitle}</p>

        <div className="space-y-2">
          <Button variant="primary" className="w-full" icon={<Printer size={15} />} onClick={() => print('label')}>
            Print 4×6 label
          </Button>
          <Button variant="secondary" className="w-full" icon={<FileText size={15} />} onClick={() => print('sheet')}>
            Print on A4 / Letter
          </Button>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--fg-3)' }}>
            4×6 in is the standard label size for thermal label printers. Choose A4 / Letter to print
            on a regular printer and cut the label out.
          </p>
        </div>

        <Button variant="neutral" className="w-full" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  )
}
