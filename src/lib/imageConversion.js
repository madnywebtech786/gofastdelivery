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
// zoom-in scrutiny. Kept high deliberately: MAX_DIMENSION below does almost
// all of the size-reduction work, so quality doesn't need to drop to hit a
// reasonable file size.
const WEBP_QUALITY = 0.82

// The <input capture="environment"> file picker (route/page.js) opens the
// phone's native camera app, which returns full sensor resolution — commonly
// 3000-4000px+ on modern phones, sent here as a JPEG that can be 8-15MB
// before this function ever runs. Nobody views a proof-of-delivery photo at
// anywhere near that resolution (phone screen, admin panel) — a 1600px long
// edge is already sharp at any realistic viewing size, so downscaling to it
// cuts file size dramatically with no visible quality loss, unlike lowering
// WEBP_QUALITY further (which trades real sharpness for smaller files, not
// just excess resolution nobody sees). This is a pure proportional resize —
// the full photo is kept, nothing is cropped — so a photo already at or
// under 1600px on its long edge passes through completely untouched.
const MAX_DIMENSION = 1600

/**
 * Converts an image File to a WebP Blob, auto-rotating from EXIF orientation
 * first (createImageBitmap's imageOrientation: 'from-image' — supported by
 * all current mobile/desktop browsers this app targets — decodes the photo
 * already right-side-up, since WebP encoding itself does not carry orientation
 * metadata forward the way a JPEG's EXIF tag would) and downscaling to fit
 * within MAX_DIMENSION on the long edge if it's larger (see doc comment
 * above) — the full frame is preserved either way, this never crops.
 *
 * Throws if the browser can't produce a WebP blob (canvas.toBlob returns null
 * on some very old browsers) — callers must treat that as a hard failure, not
 * silently fall back to uploading the original file, since the server now
 * only accepts image/webp.
 */
export async function convertPhotoToWebp(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height)
    const scale = longEdge > MAX_DIMENSION ? MAX_DIMENSION / longEdge : 1
    const width  = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, width, height)

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
