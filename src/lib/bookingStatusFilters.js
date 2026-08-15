import { calgaryDateKey, calgaryStartOfToday } from '@/lib/dateFormat'

// Maps the admin bookings page's status-filter URL values to the DB query
// shape findAllBookings/countAllBookings expect. Single source of truth for
// both src/app/admin/bookings/page.js (the list), src/app/api/bookings/
// admin-select-all/route.js ("select all" fetch), and AdminBookingsClient.js's
// own matchesCurrentFilter mirror — all three must never drift — "select all
// in this filter" must always match exactly what the filter's own list shows.
//
// `pickupDate: 'today'` on a sub-query means "restrict to bookings whose
// pickup stop's requested pickupTime falls on this calendar day" — resolved
// to a real 'YYYY-MM-DD' string (or overridden/cleared) by resolveFilterQuery
// below. Only `pending` ever carries this — the other statuses in
// `todays_work` (picked_up/failed_pickup/failed_dropoff) are "stuck right
// now" states with no natural pickup-date scoping, so they're never
// date-restricted, per product decision.
export const FILTER_QUERY_MAP = {
  // Default landing tab — everything the admin needs to act on today, in one
  // view: today's pending pickups + all ready-to-deliver + all failures.
  todays_work: {
    combine: [
      { status: ['pending'], pickupDate: 'today' },
      { status: ['picked_up'], hasDriver: false },
      { status: ['failed_pickup'] },
      { status: ['failed_dropoff'] },
    ],
  },
  pending:         { status: ['pending'], pickupDate: 'today' },
  on_the_way:      { status: ['assigned_pickup', 'assigned_delivery', 'picked_up'], hasDriver: true },
  picked_up:       { status: ['picked_up'], hasDriver: false },
  failed_pickup:   { status: ['failed_pickup'] },
  failed_dropoff:  { status: ['failed_dropoff'] },
  delivered_today: { status: ['delivered'], sinceDate: 'today' },
}

export const VALID_STATUS_FILTERS = Object.keys(FILTER_QUERY_MAP)

// "Today" always means today IN CALGARY, never the server's day. This module
// is resolved server-side (page.js / admin-select-all), and the server runs in
// UTC on Vercel — computing the date from local getters would flip this filter
// to tomorrow's pickups from ~5pm Calgary onward, every single evening.

// Applies a pickupDate override to a single sub-query if it declares one.
// pickupDateOverride: undefined = keep the sub-query's own default ('today'
// materialized to a real date); null or '' = explicitly clear the
// restriction (admin cleared the date picker) — matched by every caller
// passing this string.
function applyPickupDate(subQuery, pickupDateOverride) {
  if (subQuery.pickupDate == null) return subQuery
  const { pickupDate, ...rest } = subQuery
  if (pickupDateOverride === undefined) return { ...rest, pickupDate: calgaryDateKey() }
  if (!pickupDateOverride) return rest // explicitly cleared — no date restriction
  return { ...rest, pickupDate: pickupDateOverride }
}

// Resolves a filter key to the actual DB query object.
// pickupDateOverride: pass a 'YYYY-MM-DD' string to restrict Pending's date to
// something other than today, or '' / null to clear the date restriction
// entirely. Omit (undefined) to use today's date — the default for any
// caller that doesn't care about the date param (e.g. existing callers of
// resolveFilterQuery('pending') before this feature existed).
export function resolveFilterQuery(filterKey, pickupDateOverride) {
  const rawQuery = FILTER_QUERY_MAP[filterKey]
  if (!rawQuery) return null

  if (Array.isArray(rawQuery.combine)) {
    return { combine: rawQuery.combine.map((q) => applyPickupDate(q, pickupDateOverride)) }
  }

  let query = applyPickupDate(rawQuery, pickupDateOverride)

  if (query.sinceDate === 'today') {
    query = { ...query, sinceDate: calgaryStartOfToday() }
  }

  return query
}
