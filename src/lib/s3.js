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

const ALLOWED_IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

// Driver-captured proof-of-pickup/delivery photos. Private, like signatures —
// unlike marketing-images/, this bucket prefix has NO public bucket policy,
// since these are photos of a customer's property/packages, not marketing
// assets. The client converts the photo to WebP (with EXIF auto-rotation)
// before upload — see convertPhotoToWebp in src/lib/imageConversion.js — so
// the server never runs native image-processing code (sharp/libvips proved
// unreliable to deploy as a Vercel serverless native dependency). The server
// only validates that what arrived is actually WebP under the size cap.
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
export const MAX_PHOTOS_PER_STOP = 3

/**
 * Uploads one driver-captured photo (pickup or dropoff proof) to the private
 * S3 bucket. The photo must already be WebP — converted client-side before
 * this is called. Returns the object key only — never a URL, same convention
 * as uploadSignature. Key is namespaced by booking/stopType/driver so photos
 * from the same booking's pickup and dropoff never collide, and multiple
 * photos for the same stop each get their own uuid.
 */
export async function uploadDeliveryPhoto(buffer, contentType, { driverId, bookingId, stopType }) {
  if (contentType !== 'image/webp') {
    throw new Error('Photo must be WebP')
  }
  if (stopType !== 'pickup' && stopType !== 'dropoff') {
    throw new Error('stopType must be "pickup" or "dropoff"')
  }
  if (buffer.length === 0 || buffer.length > MAX_PHOTO_BYTES) {
    throw new Error('Photo size is invalid (must be non-empty and under 5MB)')
  }

  const key = `delivery-photos/${bookingId}/${stopType}-${driverId}-${randomUUID()}.webp`

  await getClient().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'image/webp',
  }))

  return key
}

/**
 * Deletes a delivery photo object. Same two use cases as deleteSignature:
 * driver removes a staged photo before confirming, or stop-complete
 * hard-fails after upload and the orphaned object must not linger.
 */
export async function deleteDeliveryPhoto(key) {
  if (!key || typeof key !== 'string' || !key.startsWith('delivery-photos/')) return
  await getClient().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

/**
 * Mints a short-lived presigned GET URL for viewing one delivery photo.
 * Never cached/stored — same convention as getSignatureViewUrl.
 */
export async function getDeliveryPhotoViewUrl(key, { expiresInSeconds = 300 } = {}) {
  if (!key || typeof key !== 'string' || !key.startsWith('delivery-photos/')) return null
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds })
}

/**
 * Uploads an image embedded in a marketing email template. Stored under
 * marketing-images/ — the ONLY prefix in this bucket covered by a public
 * bucket policy (Resource scoped to marketing-images/* — see
 * docs/plans/2026-08-31-email-marketing.md), because unlike signatures,
 * email clients must be able to fetch these with no auth from anywhere.
 * Returns the object's public URL directly (not a key) since callers hand
 * this straight to Unlayer as the final image src.
 */
export async function uploadMarketingImage(buffer, contentType) {
  const ext = ALLOWED_IMAGE_TYPES[contentType]
  if (!ext) {
    throw new Error(`Unsupported image type: ${contentType}. Allowed: ${Object.keys(ALLOWED_IMAGE_TYPES).join(', ')}`)
  }

  // Generous ceiling against an oversized/corrupted upload, not a realistic
  // marketing-image size — Unlayer's own custom-storage docs note common
  // client-side caps around 2-5MB for the same reason.
  const MAX_BYTES = 5 * 1024 * 1024
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    throw new Error('Image size is invalid (must be non-empty and under 5MB)')
  }

  const key = `marketing-images/${randomUUID()}.${ext}`

  await getClient().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }))

  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`
}
