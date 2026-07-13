import twilio from 'twilio'

// ── Transport ─────────────────────────────────────────────────────────────────
// Twilio client is created lazily (not at module load) so a missing/invalid
// credential doesn't crash every route that imports this file — SMS is a
// best-effort notification channel, not a hard dependency like Mongo/Redis.
let client = null
function getClient() {
  if (client) return client
  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) return null
  client = twilio(sid, token)
  return client
}

const BRAND_NAME = 'GoFastDelivery'

// ── Phone normalization ───────────────────────────────────────────────────────
// Canadian/NANP numbers only (per the client's stated scope: Canada-only SMS).
// Accepts common typed formats ("(403) 555-1234", "403-555-1234",
// "+1 403 555 1234") and normalizes to E.164 (+1XXXXXXXXXX), which Twilio's
// API requires. Returns null for anything that isn't a plausible 10-digit
// NANP number so callers can skip sending rather than let Twilio hard-error.
export function toE164Canada(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

// ── Send helper ───────────────────────────────────────────────────────────────

async function sendSms({ to, body }) {
  const e164 = toE164Canada(to)
  if (!e164) return { sent: false, reason: 'invalid-phone' }

  const c = getClient()
  const from = process.env.TWILIO_PHONE_NUMBER
  if (!c || !from) return { sent: false, reason: 'not-configured' }

  await c.messages.create({ to: e164, from, body })
  return { sent: true }
}

// ── Booking confirmation SMS ──────────────────────────────────────────────────
// Sent only to the drop-off (receiving) contact — the pickup contact keeps
// getting email only, matching the client's stated scope. Booking creation
// callers already fire this the same fire-and-forget way as sendBookingConfirmed
// in mailer.js: never block the API response, log and swallow failures.
export async function sendBookingConfirmedSms({ booking, trackingUrl }) {
  const dropoff = booking.stops?.find((s) => s.type === 'dropoff')
  const to = dropoff?.contactPhone
  if (!to) return { sent: false, reason: 'no-phone' }

  const body =
    `${BRAND_NAME}: A package is on its way to you. ` +
    `Tracking #${booking.trackingToken}. Track it here: ${trackingUrl}`

  try {
    return await sendSms({ to, body })
  } catch (err) {
    console.error('[sms] booking confirmed:', err?.message ?? err)
    return { sent: false, reason: 'send-error' }
  }
}
