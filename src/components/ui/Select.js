'use client'

import { useState, useRef, useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'

/**
 * Custom styled dropdown — renders a button trigger + animated floating menu.
 *
 * Props:
 *   label        — field label (optional)
 *   placeholder  — trigger text when no value selected
 *   value        — controlled value (must match an option's value)
 *   onChange(v)  — called with selected value string
 *   options      — [{ value, label, meta? }]  meta = optional small sub-text
 *   error        — error message string
 *   helper       — helper text string
 *   disabled     — boolean
 *   className    — extra className on the root wrapper
 *   required     — boolean (for form validation)
 *   onOpen()     — optional, fires each time the dropdown opens (e.g. to
 *                  refetch fresh options right before the user picks one)
 *   loading      — optional, shows loadingMessage instead of the option list
 *                  while a fresh fetch triggered by onOpen is in flight
 *   loadingMessage — text shown in the menu while loading (default 'Loading…')
 *   emptyMessage   — text shown in the menu when options is empty (default 'No options')
 *
 * Usage:
 *   <Select
 *     label="Weight Slab"
 *     value={form.slab}
 *     onChange={(v) => setForm(f => ({ ...f, slab: v }))}
 *     options={[{ value: 'up_to_10', label: 'Up to 10 kg' }, ...]}
 *   />
 */
export default function Select({
  label,
  placeholder = 'Select…',
  value = '',
  onChange,
  options = [],
  error,
  helper,
  disabled = false,
  className = '',
  required = false,
  onOpen,
  loading = false,
  loadingMessage = 'Loading…',
  emptyMessage = 'No options',
}) {
  const [open, setOpen]           = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const [menuStyle, setMenuStyle] = useState({})
  const wrapRef    = useRef(null)
  const triggerRef = useRef(null)
  const menuRef    = useRef(null)
  const triggerId  = useId()
  // Only auto-scroll the highlighted option into view when the highlight
  // moved via keyboard (ArrowUp/ArrowDown) — a mouse-driven open/hover
  // already shows the option the user is looking at, so scrollIntoView had
  // nothing useful to do there. Running it unconditionally on every open
  // (including a plain click) was snapping the whole PAGE scroll position
  // back to the field every time this Select was opened.
  const scrollOnHighlightRef = useRef(false)

  const selected = options.find((o) => o.value === value) ?? null

  // Close on outside click — check both the wrapper and the portalled menu
  useEffect(() => {
    function onDown(e) {
      if (
        wrapRef.current && !wrapRef.current.contains(e.target) &&
        menuRef.current && !menuRef.current.contains(e.target)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // Keyboard navigation
  function onKeyDown(e) {
    if (disabled) return
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault(); setOpen(true); setHighlighted(0); onOpen?.()
      }
      return
    }
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      scrollOnHighlightRef.current = true
      setHighlighted((h) => Math.min(h + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      scrollOnHighlightRef.current = true
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (highlighted >= 0 && options[highlighted]) {
        pick(options[highlighted].value)
      }
    }
  }

  function pick(v) {
    onChange?.(v)
    setOpen(false)
    setHighlighted(-1)
  }

  // Scroll highlighted item into view — only for keyboard-driven highlight
  // changes (see scrollOnHighlightRef above), never on open/hover.
  useEffect(() => {
    if (!open || highlighted < 0 || !menuRef.current) return
    if (!scrollOnHighlightRef.current) return
    scrollOnHighlightRef.current = false
    const item = menuRef.current.querySelectorAll('[role="option"]')[highlighted]
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlighted, open])

  // Compute portal position whenever open or window scrolls/resizes
  useEffect(() => {
    if (!open || !triggerRef.current) return
    function compute() {
      const rect        = triggerRef.current.getBoundingClientRect()
      const menuHeight  = 244
      const spaceBelow  = window.innerHeight - rect.bottom
      const showAbove   = spaceBelow < menuHeight
      setMenuStyle({
        position: 'fixed',
        zIndex:   9999,
        width:    rect.width,
        left:     rect.left,
        ...(showAbove
          ? { bottom: window.innerHeight - rect.top + 6, top: 'auto' }
          : { top: rect.bottom + 6, bottom: 'auto' }),
      })
    }
    compute()
    window.addEventListener('scroll', compute, true)
    window.addEventListener('resize', compute)
    return () => {
      window.removeEventListener('scroll', compute, true)
      window.removeEventListener('resize', compute)
    }
  }, [open])

  return (
    <div className={`flex flex-col gap-1.5 ${className}`} ref={wrapRef}>
      {label && (
        <label
          htmlFor={triggerId}
          className="text-xs font-semibold uppercase tracking-wide select-none"
          style={{ color: '#64748b' }}
        >
          {label}{required && <span style={{ color: 'var(--danger)' }} aria-hidden> *</span>}
        </label>
      )}

      {/* Hidden native select for form submission / required validation */}
      <select
        aria-hidden="true"
        tabIndex={-1}
        required={required}
        value={value}
        onChange={() => {}}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
      >
        <option value="" />
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <div className="relative">
        {/* Trigger button */}
        <button
          id={triggerId}
          ref={triggerRef}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
          onKeyDown={onKeyDown}
          onClick={() => {
            if (disabled) return
            setOpen((p) => {
              const next = !p
              if (next) onOpen?.()
              return next
            })
            setHighlighted(0)
          }}
          className="w-full flex items-center justify-between gap-2 text-left rounded-xl border px-3.5 py-2.5 text-sm transition-all duration-150 cursor-pointer select-none"
          style={{
            background: disabled ? '#f8f9fc' : '#ffffff',
            borderColor: error ? 'var(--danger)' : open ? 'var(--accent)' : 'var(--border-2)',
            boxShadow: open ? '0 0 0 3px var(--accent-dim)' : 'none',
            color: selected ? 'var(--fg)' : 'var(--fg-3)',
            opacity: disabled ? 0.55 : 1,
          }}
        >
          <span className="truncate flex-1">
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown
            size={15}
            style={{
              color: 'var(--fg-3)',
              flexShrink: 0,
              transition: 'transform 0.2s',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </button>

        {/* Dropdown menu — portalled to document.body to escape any overflow:hidden ancestor */}
        {open && typeof document !== 'undefined' && createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className="dropdown-menu"
            style={{ ...menuStyle, maxHeight: '240px', overflowY: 'auto' }}
          >
            {loading ? (
              <div className="px-3 py-3 text-sm" style={{ color: 'var(--fg-3)' }}>{loadingMessage}</div>
            ) : options.length === 0 ? (
              <div className="px-3 py-3 text-sm" style={{ color: 'var(--fg-3)' }}>{emptyMessage}</div>
            ) : options.map((opt, i) => {
              const isSelected    = opt.value === value
              const isHighlighted = highlighted === i
              return (
                <button
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  type="button"
                  data-selected={isSelected || undefined}
                  data-highlighted={isHighlighted || undefined}
                  onMouseEnter={() => setHighlighted(i)}
                  onMouseLeave={() => setHighlighted(-1)}
                  onClick={() => pick(opt.value)}
                  className="dropdown-item"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{opt.label}</span>
                    {opt.meta && (
                      <span className="block text-xs truncate mt-0.5" style={{ color: isSelected ? 'var(--accent)' : 'var(--fg-3)' }}>
                        {opt.meta}
                      </span>
                    )}
                  </span>
                  {isSelected && <Check size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                </button>
              )
            })}
          </div>,
          document.body
        )}
      </div>

      {error  && <p className="text-xs font-medium" style={{ color: 'var(--danger)' }}>{error}</p>}
      {helper && !error && <p className="text-xs" style={{ color: 'var(--fg-3)' }}>{helper}</p>}
    </div>
  )
}
