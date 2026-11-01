'use client'

// formatDateLong (not formatDateOnlyLong): createdAt is a real UTC instant, so
// it must render through Calgary's timezone. formatDateOnlyLong reads UTC
// fields literally and is only for the date-only invoice fields — using it here
// would print the previous day for any booking created after 6pm Calgary time.
import { formatDateLong } from '@/lib/dateFormat'

// Deliberately MONOCHROME — these labels are overwhelmingly printed on plain
// black-and-white office printers. That rules out two things the first draft
// got wrong:
//   1. No filled dark panels. Browsers default "background graphics" to OFF,
//      so a white-on-black header silently prints as white-on-WHITE — an
//      invisible company name. Black ink on white can't fail that way, and it
//      uses a fraction of the toner.
//   2. No brand green. It renders as an indistinct mid-grey in mono, which is
//      worse than simply setting the wordmark in black.
// Hierarchy is therefore carried entirely by type weight, size and black
// rules — which is also exactly how real thermal carrier labels are built.
const INK        = '#000000'
const INK_MUTED  = '#444444'   // still solid in mono; avoids washed-out greys

// 4x6in (101.6 x 152.4mm) is the universal shipping-label format — the thermal
// size USPS/UPS/FedEx/DHL all print to. The label is therefore ALWAYS laid out
// at exactly 4x6; `mode` only changes which page it is printed onto:
//   'label' -> the page itself is 4x6 (a real thermal label printer)
//   'sheet' -> the page is the printer's default paper (Letter/A4) and the
//              label carries a dashed cut line so it can be trimmed out
const LABEL_W = '4in'
const LABEL_H = '6in'

function findStop(booking, type) {
  return (booking?.stops ?? []).find((s) => s.type === type) ?? null
}

const S = {
  header: {
    padding: '0.13in 0.18in',
    display: 'flex',
    alignItems: 'center',
    gap: '0.1in',
    borderBottom: `3px solid ${INK}`,
    flexShrink: 0,
  },
  logo: {
    width: '0.44in',
    height: '0.44in',
    objectFit: 'contain',
    display: 'block',
    flexShrink: 0,
  },
  wordmark: {
    fontSize: '15pt',
    fontWeight: 800,
    color: INK,
    letterSpacing: '-0.3pt',
    lineHeight: 1.05,
  },
  tagline: {
    fontSize: '6.5pt',
    color: INK_MUTED,
    marginTop: '0.018in',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },

  // The three content zones FLEX rather than sitting at their natural height.
  // A 4x6 label carries only four short fields, so there is always well over
  // an inch of slack — the first version pooled all of it into one centred
  // block, which split it into a void above AND below the address. Flexing
  // every zone instead shares that slack out, so it reads as generous padding
  // inside evenly-weighted bands.
  //
  // Note `1 1 auto`, NOT the `flex: 1` shorthand: `flex: 1` means basis 0,
  // which equalises the ZONES, handing the emptiest zone the most slack. A
  // basis of `auto` starts each zone at its content height and shares out
  // only the leftover, so the padding comes out even. From and To grow
  // equally, matching their now-identical type sizes — an unequal grow here
  // would just reintroduce the size imbalance as lopsided padding.
  fromZone: {
    flex: '1 1 auto',
    minHeight: 0,
    padding: '0.1in 0.18in',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    overflow: 'hidden',
    borderBottom: `1px solid ${INK}`,
  },
  toZone: {
    flex: '1 1 auto',
    minHeight: 0,
    padding: '0.1in 0.18in',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    overflow: 'hidden',
    borderBottom: `1px solid ${INK}`,
  },
  notesZone: {
    flex: '0.7 1 auto',
    minHeight: 0,
    padding: '0.1in 0.18in',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    overflow: 'hidden',
    borderBottom: `1px solid ${INK}`,
  },

  // Sender and recipient are set IDENTICALLY — same size, weight and colour.
  // Carrier labels normally make the recipient dominant and the sender fine
  // print, but equal weighting was chosen for this label. Only the heading
  // differs: "DELIVER TO" carries slightly more weight than "FROM" so the two
  // zones stay instantly distinguishable at a glance without changing the
  // size of either address.
  zoneLabel: {
    fontSize: '8.5pt',
    fontWeight: 700,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: INK,
    marginBottom: '0.045in',
  },
  zoneLabelStrong: {
    fontSize: '8.5pt',
    fontWeight: 800,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: INK,
    marginBottom: '0.045in',
  },
  partyName: {
    fontSize: '17pt',
    fontWeight: 700,
    lineHeight: 1.12,
    letterSpacing: '-0.3pt',
  },
  partyAddress: {
    fontSize: '13pt',
    fontWeight: 600,
    lineHeight: 1.28,
    color: INK,
    marginTop: '0.045in',
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  notesText: {
    fontSize: '10pt',
    lineHeight: 1.32,
    color: INK,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },

  trackWrap: {
    padding: '0.13in 0.18in 0.14in',
    flexShrink: 0,
  },
  trackBox: {
    border: `2px solid ${INK}`,
    padding: '0.09in 0.1in 0.1in',
    textAlign: 'center',
  },
  trackLabel: {
    fontSize: '7.5pt',
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: INK_MUTED,
  },
  trackValue: {
    fontFamily: "'Courier New', Consolas, monospace",
    fontSize: '29pt',
    fontWeight: 700,
    letterSpacing: '0.06em',
    lineHeight: 1.1,
    marginTop: '0.03in',
    wordBreak: 'break-all',
  },
  footer: {
    marginTop: '0.06in',
    fontSize: '8pt',
    color: INK_MUTED,
    textAlign: 'center',
  },
  cutHint: {
    fontSize: '7pt',
    color: INK_MUTED,
    marginTop: '0.08in',
    fontFamily: "'Segoe UI', -apple-system, sans-serif",
  },
}

/**
 * The printable 4x6 shipping label. Styling is all inline on purpose — this
 * renders into a detached print window that has no stylesheet of its own, so
 * Tailwind classes would not apply (same reason InvoicePDF.js is inline-styled).
 */
export default function BookingLabel({ booking, mode = 'label', logoSrc = '/images/logo.png' }) {
  if (!booking) return null

  const pickup  = findStop(booking, 'pickup')
  const dropoff = findStop(booking, 'dropoff')

  // The notes the CUSTOMER typed while booking — stops[].notes. Deliberately
  // not stops[].driverNote, which a driver adds mid-route; that never belongs
  // on a label printed before the package is even picked up. The booking form
  // only collects a note on the pickup stop today, but the guest API and
  // admin edits can set one on either stop, so both are printed rather than
  // assumed — unprefixed, since from the customer's side these are simply
  // "the notes I wrote when I booked". Length is capped at the source — the
  // booking form's textarea maxLength (NOTES_MAX_CHARS in BookingForm.js) is
  // sized so a note always fits this block, so nothing is truncated here.
  const notes = [pickup?.notes, dropoff?.notes].filter(Boolean)

  const bookedOn = formatDateLong(booking.createdAt, { fallback: '' })

  const root = {
    width: LABEL_W,
    height: LABEL_H,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    // A shipping label spilling onto a second page is always a bug, so the
    // frame hard-clips instead. Long values are line-clamped individually
    // above, which keeps the clip from ever being what the customer sees.
    overflow: 'hidden',
    background: '#ffffff',
    color: INK,
    fontFamily: "'Segoe UI', -apple-system, 'Helvetica Neue', Arial, sans-serif",
    ...(mode === 'sheet' ? { border: '1px dashed #888888' } : {}),
  }

  return (
    <>
      <div style={root}>
        <div style={S.header}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} alt="" style={S.logo} />
          <div>
            <div style={S.wordmark}>GoFastDelivery Inc.</div>
            <div style={S.tagline}>Calgary&apos;s Same-Day Courier</div>
          </div>
        </div>

        <div style={S.fromZone}>
          <div>
            <div style={S.zoneLabel}>From</div>
            <div style={S.partyName}>{pickup?.contactName || '—'}</div>
            <div style={S.partyAddress}>{pickup?.address || '—'}</div>
          </div>
        </div>

        <div style={S.toZone}>
          <div>
            <div style={S.zoneLabelStrong}>Deliver to</div>
            <div style={S.partyName}>{dropoff?.contactName || '—'}</div>
            <div style={S.partyAddress}>{dropoff?.address || '—'}</div>
          </div>
        </div>

        {notes.length > 0 && (
          <div style={S.notesZone}>
            <div>
              <div style={S.zoneLabel}>Notes</div>
              <div style={S.notesText}>
                {notes.map((text, i) => (
                  // Index keys are safe here: this is static print output,
                  // never reordered and holding no state.
                  <div key={i} style={i === 0 ? undefined : { marginTop: '0.02in' }}>{text}</div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div style={S.trackWrap}>
          <div style={S.trackBox}>
            <div style={S.trackLabel}>Tracking ID</div>
            <div style={S.trackValue}>{booking.trackingToken || '—'}</div>
          </div>
          {bookedOn && <div style={S.footer}>Booked {bookedOn}</div>}
        </div>
      </div>

      {mode === 'sheet' && (
        <div style={S.cutHint}>Cut along the dashed line and attach to your package.</div>
      )}
    </>
  )
}

/** Window/document title, which is also the filename if the user "prints" to PDF. */
export function getLabelFilename(booking) {
  const token = (booking?.trackingToken ?? '').replace(/[^a-zA-Z0-9-_]/g, '')
  return token ? `Shipping-Label-${token}` : 'Shipping-Label'
}

/**
 * Print the label for `booking`.
 *
 * `mode`: 'label' = a 4x6 page (thermal label printer)
 *         'sheet'  = the printer's default paper with a dashed cut line
 *
 * Returns false if the print window could not be opened (popup blocker), so
 * the caller can surface that instead of appearing to do nothing.
 */
export function triggerLabelPrint(booking, mode = 'label') {
  if (!booking) return false

  // Opened synchronously, inside the click that called this. Deferring
  // window.open() until after an await/import resolves loses the user-gesture
  // association and popup blockers then reject it.
  const win = window.open('', '_blank', 'width=460,height=780')
  if (!win) return false

  const filename = getLabelFilename(booking)
  const page = mode === 'sheet'
    // size:auto honours whatever paper the printer actually has (Letter in
    // Canada, A4 elsewhere) instead of forcing one and triggering a rescale.
    ? '@page { size: auto; margin: 0.4in; }'
    : `@page { size: ${LABEL_W} ${LABEL_H}; margin: 0; }`

  win.document.title = filename
  win.document.head.innerHTML = `
    <meta charset="utf-8">
    <title>${filename}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #fff; }
      ${page}
      @media print { body { margin: 0; } }
    </style>
  `

  // react/react-dom are already in the client bundle, so these resolve from
  // cache — the dynamic import just keeps them out of this module's own
  // server-evaluated import graph (same approach as InvoicePDF.js).
  Promise.all([import('react-dom/client'), import('react')])
    .then(([{ createRoot }, { createElement }]) => {
      if (win.closed) return

      const mountPoint = win.document.createElement('div')
      win.document.body.appendChild(mountPoint)
      createRoot(mountPoint).render(
        createElement(BookingLabel, {
          booking,
          mode,
          // Absolute: the print window's own URL is about:blank, so a relative
          // src has no reliable base to resolve against.
          logoSrc: `${window.location.origin}/images/logo.png`,
        }),
      )

      // Let React paint, then wait for the logo so it can't print blank.
      setTimeout(() => printWhenReady(win), 300)
    })
    .catch(() => { if (!win.closed) win.close() })

  return true
}

/** Fire the print dialog once images have settled (or we give up waiting). */
function printWhenReady(win) {
  let printed = false

  const fire = () => {
    if (printed || win.closed) return
    printed = true
    win.focus()
    win.print()
    setTimeout(() => { if (!win.closed) win.close() }, 1000)
  }

  const pending = Array.from(win.document.images).filter((img) => !img.complete)
  if (pending.length === 0) {
    fire()
    return
  }

  let settled = 0
  const onSettle = () => { if (++settled >= pending.length) fire() }
  pending.forEach((img) => {
    img.addEventListener('load', onSettle)
    img.addEventListener('error', onSettle)
  })

  // Never hang the dialog on an image that never resolves.
  setTimeout(fire, 2000)
}
