// Client-side photo -> WebP conversion, run in the driver's browser before
// upload. Keeps native image-processing code out of the server entirely —
// sharp/libvips proved unreliable to deploy as a Vercel serverless native
// dependency (ERR_DLOPEN_FAILED: the platform binary wasn't reliably present
// in the deployed function despite being correctly listed in package-lock).
// The server (see uploadDeliveryPhoto in lib/s3.js) only validates the result
// is actually WebP under the size cap — it never converts.
'use client'

// 0.82 mirrors the quality level used everywhere WebP export happens in this
// app — visually lossless for a proof-of-delivery photo, well below print/
// zoom-in scrutiny, while cutting size substantially vs. the original
// JPEG/PNG straight off a phone camera.
const WEBP_QUALITY = 0.82

/**
 * Converts an image File to a WebP Blob, auto-rotating from EXIF orientation
 * first (createImageBitmap's imageOrientation: 'from-image' — supported by
 * all current mobile/desktop browsers this app targets — decodes the photo
 * already right-side-up, since WebP encoding itself does not carry orientation
 * metadata forward the way a JPEG's EXIF tag would).
 *
 * Throws if the browser can't produce a WebP blob (canvas.toBlob returns null
 * on some very old browsers) — callers must treat that as a hard failure, not
 * silently fall back to uploading the original file, since the server now
 * only accepts image/webp.
 */
export async function convertPhotoToWebp(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0)

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY)
    })
    if (!blob) {
      throw new Error('This browser could not convert the photo. Please update your browser and try again.')
    }
    return blob
  } finally {
    bitmap.close()
  }
}
