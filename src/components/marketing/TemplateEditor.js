'use client'

import EmailEditor from 'react-email-editor'

// {{first_name}} / {{last_name}} / {{email}} are filled in per-recipient at
// send time (src/lib/mergeTags.js) — registering them here just lets the
// marketer insert the correct token text from Unlayer's own merge-tag
// picker UI instead of typing it by hand and risking a typo that would
// leave a literal unfilled tag in a sent email.
const MERGE_TAGS = {
  first_name: { name: 'First Name', value: '{{first_name}}', sample: 'John' },
  last_name:  { name: 'Last Name',  value: '{{last_name}}',  sample: 'Doe' },
  email:      { name: 'Email',      value: '{{email}}',      sample: 'john@example.com' },
}

/**
 * Uploads a raw File (or File-like Blob) to this app's own S3-backed
 * endpoint and returns the resulting public URL. Shared by whichever of
 * Unlayer's upload callbacks actually fires — see registerImageUpload.
 */
function uploadToS3(file) {
  const formData = new FormData()
  formData.append('file', file)
  return fetch('/api/marketing/templates/upload-image', { method: 'POST', body: formData })
    .then(async (res) => {
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      return data.url
    })
}

/**
 * Intercepts Unlayer's image tool BEFORE any upload happens, so uploaded
 * images never touch Unlayer's own asset CDN, only this app's S3 bucket.
 * DIAGNOSTIC: Unlayer's actual callback name for this is inconsistent
 * across versions/doc pages ('image' per one doc, 'selectImage' per
 * another, marked "Not Recommended" there since it takes over the whole
 * upload UI) — both are registered here with console logging so we can see
 * in the browser console which one (if either) genuinely fires on a real
 * upload click. Remove the logging once confirmed.
 */
function registerImageUpload(editor) {
  editor.registerCallback('image', (file, done) => {
    console.log('[TemplateEditor] "image" callback fired', file)
    const attachment = file.attachments?.[0]
    if (!attachment) {
      done({ error: 'No file selected' })
      return
    }
    uploadToS3(attachment)
      .then((url) => done({ progress: 100, url }))
      .catch((err) => done({ error: err.message || 'Network error during upload' }))
  })

  editor.registerCallback('selectImage', (data, done) => {
    console.log('[TemplateEditor] "selectImage" callback fired', data)
    // selectImage's data shape isn't documented consistently — try the
    // common shapes (a File directly, or an attachments array like
    // the 'image' callback) rather than assuming one.
    const file = data instanceof File ? data : data?.attachments?.[0] ?? data?.file
    if (!file) {
      console.warn('[TemplateEditor] selectImage fired but no file found in data:', data)
      done({ error: 'No file selected' })
      return
    }
    uploadToS3(file)
      .then((url) => done({ url }))
      .catch((err) => done({ error: err.message || 'Network error during upload' }))
  })
}

export default function TemplateEditor({ editorRef, onReady }) {
  function handleReady(editor) {
    registerImageUpload(editor)
    onReady?.(editor)
  }

  return (
    <EmailEditor
      ref={editorRef}
      onReady={handleReady}
      options={{ mergeTags: MERGE_TAGS }}
      style={{ height: '75vh' }}
    />
  )
}
