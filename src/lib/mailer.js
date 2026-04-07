import nodemailer from 'nodemailer'

// ── Transport ─────────────────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.USER_EMAIL,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('en-CA', {
    timeZone: 'America/Edmonton',
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
const STATUS_LABELS = {
  pending:           'Order Placed',
  assigned_pickup:   'Pickup Scheduled',
  picked_up:         'Picked Up',
  assigned_delivery: 'On the Way',
  delivered:         'Delivered',
  cancelled:         'Cancelled',
}

const STATUS_COLORS = {
  pending:           '#64748b',
  assigned_pickup:   '#2563eb',
  picked_up:         '#7c3aed',
  assigned_delivery: '#d97706',
  delivered:         '#16a34a',
  cancelled:         '#dc2626',
}

// ── Base HTML wrapper ─────────────────────────────────────────────────────────

function baseTemplate({ title, preheader, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; }
    .wrapper { max-width: 600px; margin: 32px auto; padding: 0 16px 40px; }
    .card { background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .header { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 32px 32px 24px; }
    .header-logo { font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; }
    .header-logo span { color: #3b82f6; }
    .header-sub { font-size: 13px; color: #94a3b8; margin-top: 4px; }
    .body { padding: 32px; }
    .title { font-size: 22px; font-weight: 700; color: #0f172a; margin-bottom: 6px; }
    .subtitle { font-size: 14px; color: #64748b; margin-bottom: 28px; line-height: 1.5; }
    .tracking-box { background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 12px; padding: 20px 24px; margin-bottom: 28px; text-align: center; }
    .tracking-label { font-size: 11px; font-weight: 600; color: #94a3b8; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 8px; }
    .tracking-id { font-size: 26px; font-weight: 800; color: #0f172a; letter-spacing: 2px; font-family: 'Courier New', monospace; }
    .tracking-link-label { font-size: 12px; color: #64748b; margin-top: 10px; }
    .tracking-link { color: #2563eb; word-break: break-all; font-size: 13px; text-decoration: none; }
    .section-title { font-size: 12px; font-weight: 700; color: #94a3b8; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 12px; margin-top: 24px; }
    .status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 99px; font-size: 13px; font-weight: 600; margin-bottom: 20px; }
    .stop-row { display: flex; gap: 12px; margin-bottom: 16px; align-items: flex-start; }
    .stop-dot { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #fff; flex-shrink: 0; margin-top: 2px; }
    .stop-content { flex: 1; }
    .stop-type { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #64748b; margin-bottom: 2px; }
    .stop-address { font-size: 14px; color: #1e293b; line-height: 1.4; }
    .stop-meta { font-size: 12px; color: #94a3b8; margin-top: 2px; }
    .timeline { margin-left: 0; padding-left: 0; }
    .timeline-item { display: flex; gap: 14px; margin-bottom: 16px; align-items: flex-start; }
    .timeline-item:last-child { margin-bottom: 0; }
    .timeline-dot-col { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; padding-top: 3px; }
    .timeline-dot { width: 10px; height: 10px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 2px #e2e8f0; flex-shrink: 0; }
    .timeline-dot.active { box-shadow: 0 0 0 2px #3b82f6; }
    .timeline-line { width: 2px; background: #e2e8f0; flex: 1; min-height: 20px; margin-top: 4px; }
    .timeline-status { font-size: 13px; font-weight: 600; color: #1e293b; }
    .timeline-time { font-size: 12px; color: #94a3b8; margin-top: 1px; }
    .timeline-note { font-size: 12px; color: #64748b; margin-top: 2px; }
    .cta-btn { display: block; background: #2563eb; color: #ffffff !important; text-decoration: none; text-align: center; padding: 14px 24px; border-radius: 10px; font-size: 15px; font-weight: 700; margin: 28px 0 0; }
    .cta-btn:hover { background: #1d4ed8; }
    .divider { height: 1px; background: #f1f5f9; margin: 24px 0; }
    .footer { text-align: center; padding: 20px 32px; font-size: 12px; color: #94a3b8; line-height: 1.6; }
    @media (max-width: 480px) {
      .body { padding: 24px 20px; }
      .tracking-id { font-size: 20px; letter-spacing: 1px; }
      .title { font-size: 19px; }
    }
  </style>
</head>
<body>
  <div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="header-logo">Swift<span>Ship</span></div>
        <div class="header-sub">Courier &amp; Delivery Service</div>
      </div>
      <div class="body">
        ${body}
      </div>
      <div class="footer">
        SwiftShip Courier · Calgary, AB<br/>
        <a href="mailto:gofastdelivery2024@gmail.com" style="color:#94a3b8;">gofastdelivery2024@gmail.com</a>
      </div>
    </div>
  </div>
</body>
</html>`
}

// ── Stop rows HTML ────────────────────────────────────────────────────────────

function stopsHtml(stops = []) {
  return stops.map((s) => {
    const label = s.type === 'pickup' ? 'Pickup' : 'Drop-off'
    return `
      <div class="stop-row">
        <div class="stop-content">
          <div class="stop-type">${label}</div>
          <div class="stop-address">${s.address ?? ''}</div>
          ${s.contactName ? `<div class="stop-meta">${s.contactName}${s.contactPhone ? ' · ' + s.contactPhone : ''}</div>` : ''}
        </div>
      </div>`
  }).join('')
}

// ── Timeline HTML ─────────────────────────────────────────────────────────────

function timelineHtml(statusHistory = [], currentStatus) {
  if (!statusHistory.length) return ''
  return `
    <div class="section-title">Status History</div>
    <div class="timeline">
      ${statusHistory.map((h, i) => {
        const isLast = i === statusHistory.length - 1
        const color = STATUS_COLORS[h.status] ?? '#64748b'
        return `
          <div class="timeline-item">
            <div class="timeline-dot-col">
              <div class="timeline-dot ${isLast ? 'active' : ''}" style="background:${color};box-shadow:0 0 0 2px ${isLast ? color + '40' : '#e2e8f0'};"></div>
              ${!isLast ? '<div class="timeline-line"></div>' : ''}
            </div>
            <div class="timeline-content">
              <div class="timeline-status">${STATUS_LABELS[h.status] ?? h.status}</div>
              <div class="timeline-time">${formatDate(h.timestamp)}</div>
              ${h.note ? `<div class="timeline-note">${h.note}</div>` : ''}
            </div>
          </div>`
      }).join('')}
    </div>`
}

// ── Email: Booking Confirmed ──────────────────────────────────────────────────

export function buildBookingConfirmedEmail({ booking, trackingUrl, recipientType }) {
  const isSender = recipientType === 'sender'
  const token = booking.trackingToken
  const status = booking.status ?? 'pending'
  const color = STATUS_COLORS[status] ?? '#64748b'

  const body = `
    <div class="title">${isSender ? 'Booking Confirmed!' : 'A Package Is On Its Way'}</div>
    <div class="subtitle">
      ${isSender
        ? 'Your booking has been created successfully. Track your shipment with the ID below.'
        : 'Someone has sent you a package. Use the tracking ID below to follow its journey.'}
    </div>

    <div class="tracking-box">
      <div class="tracking-label">Tracking ID</div>
      <div class="tracking-id">${token}</div>
      <div class="tracking-link-label">Track online:</div>
      <a class="tracking-link" href="${trackingUrl}">${trackingUrl}</a>
    </div>

    <div style="margin-bottom:20px;">
      <span class="status-badge" style="background:${color}18;color:${color};">
        <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;"></span>
        ${STATUS_LABELS[status] ?? status}
      </span>
    </div>

    <div class="section-title">Route</div>
    ${stopsHtml(booking.stops)}

    ${booking.packageDetails?.kind ? `
    <div class="divider"></div>
    <div class="section-title">Package</div>
    <div style="font-size:14px;color:#475569;line-height:1.6;">
      <strong>Type:</strong> ${booking.packageDetails.kind}<br/>
      ${booking.packageDetails.description ? `<strong>Contents:</strong> ${booking.packageDetails.description}<br/>` : ''}
      ${booking.packageDetails.weightSlab ? `<strong>Weight:</strong> ${booking.packageDetails.weightSlab.replace(/_/g,' ')}<br/>` : ''}
    </div>` : ''}

    <a class="cta-btn" href="${trackingUrl}">Track My Package →</a>`

  return baseTemplate({
    title: isSender ? 'Booking Confirmed — SwiftShip' : 'Package On Its Way — SwiftShip',
    preheader: `Tracking ID: ${token}`,
    body,
  })
}

// ── Email: Status Update (picked_up / delivered) ──────────────────────────────

export function buildStatusUpdateEmail({ booking, trackingUrl, newStatus }) {
  const token = booking.trackingToken
  const color = STATUS_COLORS[newStatus] ?? '#64748b'
  const statusLabel = STATUS_LABELS[newStatus] ?? newStatus

  const isDelivered = newStatus === 'delivered'
  const isPickedUp  = newStatus === 'picked_up'

  const title = isDelivered
    ? '📦 Package Delivered!'
    : isPickedUp
    ? '🚚 Package Picked Up'
    : `Update: ${statusLabel}`

  const subtitle = isDelivered
    ? 'Your package has been successfully delivered.'
    : isPickedUp
    ? 'Your package has been picked up and is on its way.'
    : `Your shipment status has been updated to: ${statusLabel}.`

  const body = `
    <div class="title">${title}</div>
    <div class="subtitle">${subtitle}</div>

    <div style="margin-bottom:24px;">
      <span class="status-badge" style="background:${color}18;color:${color};">
        <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;"></span>
        ${statusLabel}
      </span>
    </div>

    <div class="tracking-box">
      <div class="tracking-label">Tracking ID</div>
      <div class="tracking-id">${token}</div>
      <div class="tracking-link-label">View full history:</div>
      <a class="tracking-link" href="${trackingUrl}">${trackingUrl}</a>
    </div>

    <div class="section-title">Route</div>
    ${stopsHtml(booking.stops)}

    ${timelineHtml(booking.statusHistory, newStatus)}

    <a class="cta-btn" href="${trackingUrl}">View Full Tracking →</a>`

  return baseTemplate({
    title: `${statusLabel} — SwiftShip`,
    preheader: `Your package is now: ${statusLabel}. Tracking: ${token}`,
    body,
  })
}

// ── Send helpers ──────────────────────────────────────────────────────────────

async function sendMail({ to, subject, html }) {
  if (!to) return
  await transporter.sendMail({
    from: `"SwiftShip Courier" <gofastdelivery2024@gmail.com>`,
    to,
    subject,
    html,
  })
}

/**
 * Send booking confirmation to sender and/or receiver.
 */
export async function sendBookingConfirmed({ booking, trackingUrl }) {
  const jobs = []

  if (booking.senderEmail) {
    jobs.push(sendMail({
      to: booking.senderEmail,
      subject: `Booking Confirmed — Tracking ID: ${booking.trackingToken}`,
      html: buildBookingConfirmedEmail({ booking, trackingUrl, recipientType: 'sender' }),
    }))
  }

  if (booking.receiverEmail && booking.receiverEmail !== booking.senderEmail) {
    jobs.push(sendMail({
      to: booking.receiverEmail,
      subject: `A Package Is On Its Way — Tracking ID: ${booking.trackingToken}`,
      html: buildBookingConfirmedEmail({ booking, trackingUrl, recipientType: 'receiver' }),
    }))
  }

  await Promise.allSettled(jobs) // never throw — email failure must not break booking creation
}

/**
 * Send status update (picked_up or delivered) to sender and receiver.
 */
export async function sendStatusUpdate({ booking, trackingUrl, newStatus }) {
  const statusLabel = STATUS_LABELS[newStatus] ?? newStatus
  const subject = `${statusLabel} — Tracking: ${booking.trackingToken}`

  const jobs = []

  if (booking.senderEmail) {
    jobs.push(sendMail({
      to: booking.senderEmail,
      subject,
      html: buildStatusUpdateEmail({ booking, trackingUrl, newStatus }),
    }))
  }

  if (booking.receiverEmail && booking.receiverEmail !== booking.senderEmail) {
    jobs.push(sendMail({
      to: booking.receiverEmail,
      subject,
      html: buildStatusUpdateEmail({ booking, trackingUrl, newStatus }),
    }))
  }

  await Promise.allSettled(jobs)
}
