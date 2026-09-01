import 'server-only'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

let client = null
function getClient() {
  if (client) return client
  const { AWS_SES_REGION, AWS_SES_ACCESS_KEY_ID, AWS_SES_SECRET_ACCESS_KEY } = process.env
  if (!AWS_SES_REGION || !AWS_SES_ACCESS_KEY_ID || !AWS_SES_SECRET_ACCESS_KEY) {
    throw new Error('AWS SES is not configured (missing AWS_SES_REGION/AWS_SES_ACCESS_KEY_ID/AWS_SES_SECRET_ACCESS_KEY)')
  }
  client = new SESClient({
    region: AWS_SES_REGION,
    credentials: {
      accessKeyId: AWS_SES_ACCESS_KEY_ID,
      secretAccessKey: AWS_SES_SECRET_ACCESS_KEY,
    },
  })
  return client
}

/**
 * True once all four required SES env vars are present. Callers use this to
 * fail fast with a clear message before a campaign gets stuck mid-send,
 * rather than discovering the missing config one recipient at a time.
 */
export function isSesConfigured() {
  return Boolean(
    process.env.AWS_SES_REGION &&
    process.env.AWS_SES_ACCESS_KEY_ID &&
    process.env.AWS_SES_SECRET_ACCESS_KEY &&
    process.env.AWS_SES_FROM_EMAIL
  )
}

/**
 * Sends one email via SES. One call per recipient — AWS's own docs
 * recommend against multi-recipient SendEmail calls, since a single
 * rejected address would otherwise fail the entire call.
 * Returns { success: true, messageId } or { success: false, error }.
 * Never throws — callers (the batch loop) need per-recipient outcomes,
 * not one failure aborting the whole batch.
 */
export async function sendMarketingEmail({ to, subject, html }) {
  const fromName  = process.env.AWS_SES_FROM_NAME || 'Go Fast Delivery Inc.'
  const fromEmail = process.env.AWS_SES_FROM_EMAIL
  if (!fromEmail) {
    return { success: false, error: 'AWS_SES_FROM_EMAIL is not configured' }
  }

  try {
    const command = new SendEmailCommand({
      Source: `"${fromName}" <${fromEmail}>`,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Html: { Data: html, Charset: 'UTF-8' } },
      },
    })
    const result = await getClient().send(command)
    return { success: true, messageId: result.MessageId }
  } catch (err) {
    return { success: false, error: err.message || 'Unknown SES error' }
  }
}
