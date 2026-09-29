/**
 * Renders a stop's two distinct note fields, clearly labeled so they're
 * never confused with each other:
 *   stop.notes       — the CUSTOMER's own note, typed at booking creation,
 *                       read-only afterward (never edited by anyone else).
 *   stop.driverNote   — the DRIVER's own note, added per-stop during
 *                       delivery (see updateStopDriverNote in db/bookings.js).
 * Renders nothing for a field that's absent — a stop with neither note
 * present renders null, so callers don't need their own presence check.
 *
 * Renders a bare fragment (no wrapping div/spacing of its own) so it
 * composes correctly whether the caller stacks it vertically or wraps it
 * inline alongside other pills — the caller's own container controls layout.
 */
export default function StopNotes({ stop }) {
  if (!stop?.notes && !stop?.driverNote) return null
  return (
    <>
      {stop.notes && (
        <p className="text-xs px-2 py-1 rounded-lg inline-block" style={{ color: 'var(--fg-2)', background: 'var(--surface-2)' }}>
          <span className="font-semibold">Customer note:</span> {stop.notes}
        </p>
      )}
      {stop.driverNote && (
        <p className="text-xs px-2 py-1 rounded-lg inline-block" style={{ color: '#92400e', background: '#fef3c7' }}>
          <span className="font-semibold">Driver note:</span> {stop.driverNote}
        </p>
      )}
    </>
  )
}
