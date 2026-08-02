// Calgary-anchored date-boundary helpers for MongoDB query filters.
//
// `new Date(); d.setHours(0,0,0,0)` gives midnight in the SERVER's local
// timezone (UTC on Vercel), not midnight in Calgary — a driver's "delivered
// today" count or an admin's "today" query computed that way can be off by
// up to a day's worth of bookings right around Calgary midnight. These
// helpers compute the correct UTC instant for a Calgary calendar-day
// boundary, for use directly in Mongo date-range filters.

import { CALGARY_TZ } from '../dateFormat.js'

export { CALGARY_TZ }

/**
 * The UTC Date instant corresponding to local midnight in Calgary, for the
 * given moment (defaults to now). Use this instead of
 * `new Date().setHours(0,0,0,0)` in any Mongo query filter that means
 * "today" for a Calgary-based user (customer/admin/driver).
 */
export function calgaryStartOfToday(now = new Date()) {
  // en-CA with no format options already yields "YYYY-MM-DD" in the target zone.
  const ymd = now.toLocaleDateString('en-CA', { timeZone: CALGARY_TZ })
  // Ask Intl what UTC offset Calgary is currently at (handles MST/MDT
  // automatically) by formatting local midnight and reading back the parts,
  // rather than hardcoding a fixed UTC-6/UTC-7 offset that would be wrong
  // half the year.
  const probe = new Date(`${ymd}T00:00:00.000Z`)
  const offsetMinutes = getTimezoneOffsetMinutes(probe, CALGARY_TZ)
  return new Date(probe.getTime() - offsetMinutes * 60000)
}

// Returns the timezone's offset from UTC in minutes (positive = behind UTC,
// matching Calgary's MST -420 / MDT -360) for the given instant.
function getTimezoneOffsetMinutes(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]))
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
  )
  return Math.round((asUTC - date.getTime()) / 60000)
}
