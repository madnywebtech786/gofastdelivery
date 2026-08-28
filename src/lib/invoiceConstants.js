// Fixed company-identity constants shown on every invoice (PDF, email,
// on-screen detail, admin form footnote). Not stored per-invoice and not
// admin-editable — these describe the company itself, not something that
// varies invoice to invoice. Client-safe (no server-only imports) so both
// server renderers (invoicePdf.js, mailer.js) and client components
// (InvoicePDF.js, InvoiceForm.js, InvoiceDetailClient.js) can import it.

export const COMPANY_GST_NUMBER = '761649573RT0001'
