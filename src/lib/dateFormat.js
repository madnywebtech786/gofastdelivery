// Shared date/time formatting — GoFastDelivery operates only in Calgary, AB,
// so every customer/admin/driver-facing date or time must render in Calgary's
// timezone regardless of where the Node process actually runs (Vercel's
// server timezone is UTC, not Calgary — without an explicit `timeZone` here,
// `toLocaleString`/`toLocaleDateString` silently use the server's zone, which
// is wrong for anyone reading the result in Calgary). Works identically in
// server and client code since `Intl`/`toLocaleString` support `timeZone` in
// both contexts — no server/client split needed.
//
// Two different kinds of "date" flow through this app and need different
// handling — mixing them up is the exact class of bug this file exists to
// prevent:
//   1. Real UTC instants (`createdAt`, `updatedAt`, `statusHistory[].timestamp`,
//      `completedAt`, `estimatedArrivalAt`, invoice `invoiceDate`/`dueDate`) —
//      stored as actual Date/ISO values. Use CALGARY_TZ on render so they
//      display as Calgary wall-clock time. Use formatDateTime/formatDate/formatTime.
//   2. Wall-clock strings with no timezone info (`stops[].pickupTime`, stored
//      as raw "YYYY-MM-DDTHH:mm" — exactly what the customer typed while
//      looking at a Calgary clock, never converted). These must be displayed
//      back literally, not re-interpreted through a timezone — use
//      formatPickupTime(), which parses the string's own fields directly
//      instead of routing it through `new Date(string)` (which would
//      re-interpret it in whatever zone the JS engine defaults to).

export const CALGARY_TZ = 'America/Edmonton'

function toDate(val) {
  const d = val instanceof Date ? val : new Date(val)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Full date + time, Calgary timezone. e.g. "Jul 27, 2026, 02:18 PM"
 * Pass includeYear: false for a compact "Jul 27, 02:18 PM" form (small
 * widgets like status timelines where space is tight and the year is
 * usually obvious from context). Pass includeWeekday: true to prefix e.g.
 * "Mon, Jul 27, 2026, 02:18 PM".
 */
export function formatDateTime(val, { fallback = '—', includeYear = true, includeWeekday = false } = {}) {
  const d = toDate(val)
  if (!d) return fallback
  return d.toLocaleString('en-CA', {
    timeZone: CALGARY_TZ,
    ...(includeWeekday ? { weekday: 'short' } : {}),
    ...(includeYear ? { year: 'numeric' } : {}),
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/**
 * Date only, Calgary timezone. e.g. "Jul 27, 2026"
 */
export function formatDate(val, { fallback = '—', includeYear = true } = {}) {
  const d = toDate(val)
  if (!d) return fallback
  return d.toLocaleDateString('en-CA', {
    timeZone: CALGARY_TZ,
    ...(includeYear ? { year: 'numeric' } : {}),
    month: 'short', day: 'numeric',
  })
}

/**
 * Long-form date only, Calgary timezone. e.g. "July 27, 2026" (invoices/PDFs)
 */
export function formatDateLong(val, { fallback = '—' } = {}) {
  const d = toDate(val)
  if (!d) return fallback
  return d.toLocaleDateString('en-CA', {
    timeZone: CALGARY_TZ,
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

/**
 * Full weekday + long date, no year, Calgary timezone. e.g.
 * "Monday, July 27" — for "today is..." headers.
 */
export function formatDateFull(val = new Date(), { fallback = '—' } = {}) {
  const d = toDate(val)
  if (!d) return fallback
  return d.toLocaleDateString('en-CA', {
    timeZone: CALGARY_TZ,
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

/**
 * Time only, Calgary timezone. e.g. "2:18 PM"
 */
export function formatTime(val, { fallback = '—' } = {}) {
  const d = toDate(val)
  if (!d) return fallback
  return d.toLocaleTimeString('en-CA', {
    timeZone: CALGARY_TZ,
    hour: 'numeric', minute: '2-digit',
  })
}

/**
 * Short weekday name, Calgary timezone. e.g. "Mon"
 */
export function formatWeekdayShort(val) {
  const d = toDate(val)
  if (!d) return ''
  return d.toLocaleDateString('en-CA', { timeZone: CALGARY_TZ, weekday: 'short' })
}

/**
 * Full weekday name, Calgary timezone. e.g. "Monday"
 */
export function formatWeekdayLong(val) {
  const d = toDate(val)
  if (!d) return ''
  return d.toLocaleDateString('en-CA', { timeZone: CALGARY_TZ, weekday: 'long' })
}

/**
 * "YYYY-MM-DD" for the given instant AS SEEN IN CALGARY — use this instead of
 * `.toISOString().slice(0,10)` (which is UTC) whenever you need "today's
 * date" for day-boundary comparisons/grouping that should follow the Calgary
 * calendar day, not the UTC calendar day.
 */
export function calgaryDateKey(val = new Date()) {
  const d = toDate(val) ?? new Date()
  // en-CA's toLocaleDateString with no format options is already YYYY-MM-DD.
  return d.toLocaleDateString('en-CA', { timeZone: CALGARY_TZ })
}

/**
 * "Today" / "Yesterday" / weekday / short-date label for grouping a list of
 * timestamps by Calgary calendar day — e.g. driver history grouped by
 * delivery day. Compares CALENDAR days in Calgary (via calgaryDateKey), not
 * a raw millisecond difference, so it can't misfire near midnight just
 * because the viewer's device clock/timezone differs from Calgary's.
 */
export function formatRelativeDayLabel(val) {
  const d = toDate(val)
  if (!d) return ''
  const todayKey = calgaryDateKey()
  const key = calgaryDateKey(d)
  if (key === todayKey) return 'Today'

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (key === calgaryDateKey(yesterday)) return 'Yesterday'

  // Within the last week: weekday name; older: short date.
  const daysAgo = Math.round((new Date(todayKey) - new Date(key)) / 86400000)
  if (daysAgo >= 0 && daysAgo < 7) return formatWeekdayLong(d)
  return formatDate(d, { includeYear: false })
}

/**
 * Live clock string, Calgary timezone, 24h. e.g. "14:18:07"
 */
export function formatClock(val = new Date()) {
  const d = toDate(val) ?? new Date()
  return d.toLocaleTimeString('en-CA', { timeZone: CALGARY_TZ, hour12: false })
}

/**
 * Renders a `pickupTime` wall-clock string ("YYYY-MM-DDTHH:mm", already a
 * Calgary local time as typed by the customer — see file header) WITHOUT
 * routing it through `new Date(string)`, which would re-interpret the string
 * in the JS engine's default timezone rather than displaying it literally.
 * Parses the string's own date/time fields directly instead.
 */
export function formatPickupTime(pickupTime, { fallback = null } = {}) {
  if (!pickupTime || typeof pickupTime !== 'string') return fallback
  const [datePart, timePart] = pickupTime.split('T')
  if (!datePart || !timePart) return fallback
  const [y, m, day] = datePart.split('-').map(Number)
  const [h, min] = timePart.split(':').map(Number)
  if (![y, m, day, h, min].every(Number.isFinite)) return fallback

  // Build a Date whose LOCAL getters return exactly these fields — the exact
  // timezone this Date object thinks it's in doesn't matter, since we only
  // ever read back the same local fields we just set, so it round-trips
  // correctly regardless of server timezone.
  const d = new Date(y, m - 1, day, h, min)
  const date = d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })
  return `${date}, ${time}`
}
