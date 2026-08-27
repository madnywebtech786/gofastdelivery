'use client'

import { useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { X, RotateCcw, Check } from 'lucide-react'

/**
 * Full-screen signature capture overlay. Two internal phases:
 *  - 'drawing': live canvas, Clear + Done
 *  - 'preview': static PNG preview, Redo (back to drawing, canvas cleared)
 *    + Use This Signature (calls onConfirm with the data URL)
 *
 * Purely presentational/canvas-local state — no network calls here at all.
 * The parent (driver/route/page.js) only uploads the resulting data URL to
 * S3 once the driver later taps "Confirm Delivery", never at "Use This
 * Signature" — this component has no knowledge of S3, bookings, or
 * stop-complete, and nothing here can ever leave state that has to be
 * cleaned up mid-flow.
 */
export default function SignaturePad({ onConfirm, onCancel }) {
  const canvasRef = useRef(null)
  const [phase, setPhase] = useState('drawing') // 'drawing' | 'preview'
  const [previewDataUrl, setPreviewDataUrl] = useState(null)
  const [isEmpty, setIsEmpty] = useState(true)

  function handleClear() {
    canvasRef.current?.clear()
    setIsEmpty(true)
  }

  function handleDone() {
    if (!canvasRef.current || canvasRef.current.isEmpty()) return
    const dataUrl = canvasRef.current.getTrimmedCanvas().toDataURL('image/png')
    setPreviewDataUrl(dataUrl)
    setPhase('preview')
  }

  function handleRedo() {
    setPreviewDataUrl(null)
    setPhase('drawing')
    setIsEmpty(true)
    // Canvas remounts clean because it's only rendered in the 'drawing' phase below.
  }

  return (
    <div className="fixed inset-0 z-200 bg-white flex flex-col">
      {/* Header */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-gray-200 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100"
          aria-label="Cancel signature"
        >
          <X size={18} />
        </button>
        <h1 className="text-sm font-bold text-gray-900">Customer Signature</h1>
        <div className="w-9" />
      </div>

      {phase === 'drawing' ? (
        <>
          <div className="flex-1 relative bg-gray-50">
            <SignatureCanvas
              ref={canvasRef}
              penColor="#111827"
              onBegin={() => setIsEmpty(false)}
              canvasProps={{ className: 'w-full h-full', style: { touchAction: 'none' } }}
            />
            <div className="absolute inset-x-0 bottom-6 flex justify-center pointer-events-none">
              <p className="text-xs text-gray-400">Sign above with your finger or stylus</p>
            </div>
          </div>
          <div className="p-4 border-t border-gray-200 flex gap-3 shrink-0" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
            <button
              type="button"
              onClick={handleClear}
              disabled={isEmpty}
              className="flex-1 rounded-2xl py-3 text-sm font-semibold border border-gray-200 text-gray-600 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <RotateCcw size={15} />
              Clear
            </button>
            <button
              type="button"
              onClick={handleDone}
              disabled={isEmpty}
              className="flex-1 rounded-2xl py-3 text-sm font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ background: 'var(--accent)' }}
            >
              <Check size={15} />
              Done
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 bg-gray-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Preview</p>
            <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview, not a remote/optimizable image */}
              <img src={previewDataUrl} alt="Signature preview" className="w-full h-auto" />
            </div>
          </div>
          <div className="p-4 border-t border-gray-200 flex gap-3 shrink-0" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
            <button
              type="button"
              onClick={handleRedo}
              className="flex-1 rounded-2xl py-3 text-sm font-semibold border border-gray-200 text-gray-600 flex items-center justify-center gap-2"
            >
              <RotateCcw size={15} />
              Redo
            </button>
            <button
              type="button"
              onClick={() => onConfirm(previewDataUrl)}
              className="flex-1 rounded-2xl py-3 text-sm font-bold text-white flex items-center justify-center gap-2"
              style={{ background: 'var(--accent)' }}
            >
              Use This Signature
            </button>
          </div>
        </>
      )}
    </div>
  )
}
