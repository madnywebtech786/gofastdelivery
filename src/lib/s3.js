import 'server-only'
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

const REGION = process.env.AWS_REGION
const BUCKET = process.env.AWS_S3_BUCKET_NAME

let client = null
function getClient() {
  if (client) return client
  if (!REGION || !BUCKET || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS S3 is not configured (missing AWS_REGION/AWS_S3_BUCKET_NAME/AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY)')
  }
  client = new S3Client({
    region: REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  })
  return client
}

const DATA_URL_RE = /^data:image\/png;base64,/

/**
 * Uploads a delivery signature PNG to the private S3 bucket. Returns the
 * object key only — never a URL. Key is namespaced by driver/booking so
 * orphaned/duplicate uploads (redo before confirm) never collide.
 */
export async function uploadSignature(dataUrl, { driverId, bookingId }) {
  if (typeof dataUrl !== 'string' || !DATA_URL_RE.test(dataUrl)) {
    throw new Error('Signature must be a base64 PNG data URL')
  }
  const base64 = dataUrl.replace(DATA_URL_RE, '')
  const buffer = Buffer.from(base64, 'base64')

  // Real cap: a full-screen 800x300 canvas at reasonable stroke density is
  // well under 200KB as PNG. 2MB is a generous ceiling against a corrupted/
  // oversized payload, not a realistic signature size.
  const MAX_BYTES = 2 * 1024 * 1024
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    throw new Error('Signature image size is invalid')
  }

  const key = `signatures/${bookingId}/${driverId}-${randomUUID()}.png`

  await getClient().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'image/png',
  }))

  return key
}

/**
 * Deletes a signature object. Used for two cases: (1) the driver redoes a
 * signature before confirming (the old key is discarded), (2) stop-complete
 * hard-fails after upload and the orphaned object must not linger. S3 DELETE
 * is idempotent — deleting an already-gone key is not an error.
 */
export async function deleteSignature(key) {
  if (!key || typeof key !== 'string' || !key.startsWith('signatures/')) return
  await getClient().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

/**
 * Mints a short-lived presigned GET URL for viewing a signature. Never
 * cached/stored — callers fetch this on demand (see the lazy-view routes).
 */
export async function getSignatureViewUrl(key, { expiresInSeconds = 300 } = {}) {
  if (!key || typeof key !== 'string' || !key.startsWith('signatures/')) return null
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds })
}
