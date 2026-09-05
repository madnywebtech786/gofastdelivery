import 'server-only'
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'
import sharp from 'sharp'

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
// assets. Camera-captured photos are realistically JPEG (occasionally PNG/
// WebP from some devices) and 1-5MB, unlike a signature's small trimmed PNG.
// This 5MB ceiling applies to the ORIGINAL upload, before WebP conversion —
// the stored object is typically much smaller (see uploadDeliveryPhoto).
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
export const MAX_PHOTOS_PER_STOP = 3
// 82 is sharp's own documented WebP default and a well-established
// sweet spot for photographic content — visually lossless for a proof-of-
// delivery photo (not a print/zoom-in use case) while cutting file size
// substantially versus the original JPEG/PNG upload.
const PHOTO_WEBP_QUALITY = 82

/**
 * Uploads one driver-captured photo (pickup or dropoff proof) to the private
 * S3 bucket, converting it to WebP first — smaller stored size and faster
 * load for admin/customer viewing than the original JPEG/PNG straight off a
 * phone camera, at negligible visual cost for a proof photo. Returns the
 * object key only — never a URL, same convention as uploadSignature. Key is
 * namespaced by booking/stopType/driver so photos from the same booking's
 * pickup and dropoff never collide, and multiple photos for the same stop
 * each get their own uuid.
 */
export async function uploadDeliveryPhoto(buffer, contentType, { driverId, bookingId, stopType }) {
  if (!ALLOWED_IMAGE_TYPES[contentType]) {
    throw new Error(`Unsupported image type: ${contentType}. Allowed: ${Object.keys(ALLOWED_IMAGE_TYPES).join(', ')}`)
  }
  if (stopType !== 'pickup' && stopType !== 'dropoff') {
    throw new Error('stopType must be "pickup" or "dropoff"')
  }
  if (buffer.length === 0 || buffer.length > MAX_PHOTO_BYTES) {
    throw new Error('Photo size is invalid (must be non-empty and under 5MB)')
  }

  let webpBuffer
  try {
    webpBuffer = await sharp(buffer)
      .rotate() // auto-orient from EXIF BEFORE conversion — WebP encoding drops
                // EXIF, so a phone photo taken sideways would otherwise display
                // rotated incorrectly with no metadata left to correct it.
      .webp({ quality: PHOTO_WEBP_QUALITY })
      .toBuffer()
  } catch (err) {
    throw new Error(`Could not process photo: ${err.message}`)
  }

  const key = `delivery-photos/${bookingId}/${stopType}-${driverId}-${randomUUID()}.webp`

  await getClient().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: webpBuffer,
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
