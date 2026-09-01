// Sample values shown in Unlayer's own merge-tag picker
// (src/components/marketing/TemplateEditor.js) and reused for the template
// preview page — kept in one place so preview and the picker's example text
// never drift apart.
export const SAMPLE_MERGE_TAG_VALUES = {
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
}

/**
 * Replaces {{first_name}}, {{last_name}}, {{email}} tokens in template HTML
 * with a subscriber's actual values. Missing name fields fall back to an
 * empty string, not "undefined" or the literal token — a blank space in a
 * greeting reads better than "Hi undefined," or a literal unfilled tag.
 */
export function fillMergeTags(html, { firstName, lastName, email } = {}) {
  return html
    .replace(/\{\{\s*first_name\s*\}\}/gi, firstName ?? '')
    .replace(/\{\{\s*last_name\s*\}\}/gi, lastName ?? '')
    .replace(/\{\{\s*email\s*\}\}/gi, email ?? '')
}

/**
 * Same replacement, but with the fixed sample values shown in Unlayer's own
 * merge-tag picker — used for previewing a template before any real
 * recipient exists.
 */
export function fillSampleMergeTags(html) {
  return fillMergeTags(html, {
    firstName: SAMPLE_MERGE_TAG_VALUES.first_name,
    lastName: SAMPLE_MERGE_TAG_VALUES.last_name,
    email: SAMPLE_MERGE_TAG_VALUES.email,
  })
}

/**
 * Appends a per-subscriber unsubscribe link before the closing </body> tag
 * (or at the end of the HTML if no </body> is found — Unlayer's export
 * always includes one, but this guards against a manually-edited template).
 * Required on every campaign email for CASL/CAN-SPAM compliance — this is
 * applied at send time, not left to marketers to remember to add to every
 * template.
 */
export function appendUnsubscribeFooter(html, baseUrl, unsubscribeToken) {
  const unsubscribeUrl = `${baseUrl}/api/marketing/unsubscribe?token=${unsubscribeToken}`
  const footer = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding:20px;text-align:center;font-size:11px;color:#94a3b8;">
        <a href="${unsubscribeUrl}" style="color:#94a3b8;text-decoration:underline;">Unsubscribe</a> from these emails.
      </td></tr>
    </table>`
  return html.includes('</body>') ? html.replace('</body>', `${footer}</body>`) : html + footer
}
