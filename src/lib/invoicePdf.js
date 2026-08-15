import PDFDocument from 'pdfkit'
import path from 'path'
import { formatDateOnlyLong as formatDate } from './dateFormat'

const BRAND_GREEN  = '#1bb908'
const DARK         = '#0f172a'
const MID          = '#475569'
const LIGHT        = '#94a3b8'
const BORDER       = '#e2e8f0'
const BG_LIGHT     = '#f8fafc'

function calcTotals(invoice) {
  const items    = invoice.items ?? []
  const subtotal = items.reduce((s, it) => s + (it.rate ?? 0) * (it.quantity ?? 0), 0)
  const taxAmt   = Math.round(subtotal * ((invoice.taxRate ?? 5) / 100) * 100) / 100
  const total    = subtotal + taxAmt
  const balance  = total - (invoice.amountPaid ?? 0)
  return { subtotal, taxAmt, total, balance }
}

function fmt(n, currency = 'CAD') {
  return `${currency} $${Number(n ?? 0).toFixed(2)}`
}

export function buildInvoicePdf(invoice) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true })
    const chunks = []
    doc.on('data',  chunk => chunks.push(chunk))
    doc.on('end',   ()    => resolve(Buffer.concat(chunks)))
    doc.on('error', err   => reject(err))

    const { subtotal, taxAmt, total, balance } = calcTotals(invoice)
    const currency = invoice.currency ?? 'CAD'
    const W = doc.page.width - 100  // usable width (margin 50 each side)
    const L = 50                    // left margin

    // ── Header bar ────────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 6).fill(BRAND_GREEN)

    // Logo image
    const logoPath = path.join(process.cwd(), 'public', 'images', 'logo.png')
    try {
      doc.image(logoPath, L, 18, { height: 48, fit: [120, 48] })
    } catch {
      // fallback to text if image missing
      doc.font('Helvetica-Bold').fontSize(20).fillColor(DARK)
         .text('GoFast', L, 30, { continued: true })
         .fillColor(BRAND_GREEN).text('Delivery')
    }

    doc.font('Helvetica').fontSize(9).fillColor(LIGHT)
       .text("Calgary's Same-Day Courier · Calgary, AB", L, 72)

    // Invoice label top-right
    doc.font('Helvetica-Bold').fontSize(22).fillColor(DARK)
       .text('INVOICE', L, 24, { align: 'right', width: W })

    doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND_GREEN)
       .text(invoice.invoiceNumber ?? '', L, 50, { align: 'right', width: W })

    doc.moveTo(L, 92).lineTo(L + W, 92).lineWidth(1).strokeColor(BORDER).stroke()

    // ── From / Bill To columns ─────────────────────────────────────────────────
    const colW = W / 2 - 10
    let y = 104

    doc.font('Helvetica-Bold').fontSize(8).fillColor(LIGHT)
       .text('FROM', L, y).text('BILL TO', L + colW + 20, y)
    y += 14

    const from = [
      invoice.companyName    || 'Go Fast Delivery Inc.',
      invoice.companyAddress || '',
      invoice.companyCity    || '',
      invoice.companyEmail   || '',
      invoice.companyPhone   || '',
    ].filter(Boolean)

    const billTo = [
      invoice.clientName    || '',
      invoice.clientAddress || '',
      invoice.clientCity    || '',
      invoice.clientEmail   || '',
      invoice.clientPhone   || '',
    ].filter(Boolean)

    const fromText  = from.join('\n')
    const billText  = billTo.join('\n')

    doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK)
       .text(from[0],    L,              y, { width: colW })
       .text(billTo[0],  L + colW + 20,  y, { width: colW })

    const restFrom = from.slice(1).join('\n')
    const restBill = billTo.slice(1).join('\n')
    if (restFrom || restBill) {
      const afterNameY = y + 14
      doc.font('Helvetica').fontSize(9).fillColor(MID)
         .text(restFrom, L,             afterNameY, { width: colW, lineGap: 1 })
         .text(restBill, L + colW + 20, afterNameY, { width: colW, lineGap: 1 })
    }

    // advance past the taller column
    const fromLines = from.length
    const billLines = billTo.length
    y += 14 + Math.max(fromLines - 1, billLines - 1) * 13 + 16

    doc.moveTo(L, y).lineTo(L + W, y).lineWidth(0.5).strokeColor(BORDER).stroke()
    y += 12

    // ── Invoice meta row ───────────────────────────────────────────────────────
    const metaItems = [
      ['Invoice Date', formatDate(invoice.invoiceDate)],
      ['Due Date',     'On Receipt'],
      ['For',          'Delivery Services'],
    ]
    const metaColW = W / metaItems.length

    metaItems.forEach(([label, value], i) => {
      const x = L + i * metaColW
      doc.font('Helvetica-Bold').fontSize(7).fillColor(LIGHT).text(label.toUpperCase(), x, y, { width: metaColW - 4 })
      doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text(value, x, y + 11, { width: metaColW - 4 })
    })

    y += 36
    doc.moveTo(L, y).lineTo(L + W, y).lineWidth(0.5).strokeColor(BORDER).stroke()
    y += 14

    // ── Line items table ───────────────────────────────────────────────────────
    const colDesc  = W * 0.50
    const colRate  = W * 0.16
    const colQty   = W * 0.12
    const colAmt   = W * 0.22

    // Header row
    doc.rect(L, y, W, 20).fill(BG_LIGHT)
    doc.font('Helvetica-Bold').fontSize(8).fillColor(LIGHT)
    doc.text('DESCRIPTION',  L + 6,               y + 6, { width: colDesc - 6 })
       .text('RATE',         L + colDesc,          y + 6, { width: colRate,  align: 'right' })
       .text('QTY',          L + colDesc + colRate, y + 6, { width: colQty,   align: 'right' })
       .text('AMOUNT',       L + colDesc + colRate + colQty, y + 6, { width: colAmt - 6, align: 'right' })
    y += 20

    const items = invoice.items ?? []
    items.forEach((item, i) => {
      const amt        = (item.rate ?? 0) * (item.quantity ?? 0)
      const hasDetails = item.serviceDate || item.details

      // Row height grows to fit the actual details text (previously a fixed
      // 22px box with ellipsis:true silently cut off anything past ~3 lines
      // — a real problem for multi-day delivery-detail lists). Measure the
      // wrapped height with the same font/size/width used to draw it below,
      // so the box is never smaller than what's about to be rendered.
      let detailsHeight = 0
      if (item.details) {
        doc.font('Helvetica').fontSize(7.5)
        detailsHeight = doc.heightOfString(item.details, { width: colDesc - 12, lineGap: 1 })
      }
      const baseH = hasDetails ? (item.serviceDate ? 31 : 20) : 26
      const rowH  = item.details ? baseH + detailsHeight + 8 : baseH

      // Start a new page if this row would overflow the current one — the
      // rest of this document has no page-break handling, but a long
      // details block is exactly the case most likely to need it.
      const pageBottom = doc.page.height - doc.page.margins.bottom
      if (y + rowH > pageBottom) {
        doc.addPage()
        y = doc.page.margins.top
      }

      if (i % 2 !== 0) doc.rect(L, y, W, rowH).fill('#fafcff')

      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(DARK)
         .text(item.description || '', L + 6, y + 7, { width: colDesc - 12, lineBreak: false })

      if (item.serviceDate) {
        doc.font('Helvetica').fontSize(8).fillColor(LIGHT)
           .text(item.serviceDate, L + 6, y + 20, { width: colDesc - 12, lineBreak: false })
      }
      if (item.details) {
        const detailsY = item.serviceDate ? y + 31 : y + 20
        doc.font('Helvetica').fontSize(7.5).fillColor(MID)
           .text(item.details, L + 6, detailsY, { width: colDesc - 12, lineGap: 1 })
      }

      // Rate/qty/amount stay vertically centred in the row's TOP portion
      // (description + service date), never pulled down into a long details
      // block below them.
      const numY = y + baseH / 2 - 5
      doc.font('Helvetica').fontSize(9.5).fillColor(MID)
         .text(`$${Number(item.rate ?? 0).toFixed(2)}`, L + colDesc, numY, { width: colRate, align: 'right' })
         .text(String(item.quantity ?? ''), L + colDesc + colRate, numY, { width: colQty, align: 'right' })

      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(DARK)
         .text(`$${amt.toFixed(2)}`, L + colDesc + colRate + colQty, numY, { width: colAmt - 6, align: 'right' })

      doc.moveTo(L, y + rowH).lineTo(L + W, y + rowH).lineWidth(0.3).strokeColor(BORDER).stroke()
      y += rowH
    })

    // Totals/payment-instructions/notes below assume they fit under the
    // items table without their own page-break check — add one here too,
    // since a long details block can now push y much further down than
    // before this fix.
    {
      const pageBottom = doc.page.height - doc.page.margins.bottom
      if (y + 150 > pageBottom) {
        doc.addPage()
        y = doc.page.margins.top
      }
    }

    y += 16

    // ── Totals ─────────────────────────────────────────────────────────────────
    const totalsX = L + W * 0.55
    const totalsW = W * 0.45

    const totalsRows = [
      ['Subtotal',                           `$${subtotal.toFixed(2)}`, false],
      [`Tax (${invoice.taxRate ?? 5}% GST)`, `$${taxAmt.toFixed(2)}`,   false],
      ...(invoice.amountPaid > 0 ? [['Amount Paid', `−$${Number(invoice.amountPaid).toFixed(2)}`, false]] : []),
    ]

    totalsRows.forEach(([label, value]) => {
      doc.font('Helvetica').fontSize(9.5).fillColor(MID)
         .text(label, totalsX, y, { width: totalsW * 0.55 })
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(DARK)
         .text(value, totalsX + totalsW * 0.55, y, { width: totalsW * 0.45, align: 'right' })
      y += 17
    })

    // ── Payment instructions (above balance due) ────────────────────────────────
    y += 24
    doc.moveTo(L, y).lineTo(L + W, y).lineWidth(0.5).strokeColor(BORDER).stroke()
    y += 12
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND_GREEN).text('PAYMENT INSTRUCTIONS', L, y)
    y += 13
    doc.font('Helvetica').fontSize(9.5).fillColor(MID).text(
      `We accept payment via Interac e-Transfer, send to gofastdelivery2024@gmail.com. ` +
      `Please include the invoice number ${invoice.invoiceNumber ?? ''} in the transfer message so we can match your payment quickly.`,
      L, y, { width: W, lineGap: 2 }
    )
    y = doc.y

    // Balance due row
    y += 20
    doc.moveTo(totalsX, y).lineTo(totalsX + totalsW, y).lineWidth(1).strokeColor(BRAND_GREEN).stroke()
    y += 8
    doc.font('Helvetica-Bold').fontSize(11).fillColor(DARK)
       .text('Balance Due', totalsX, y, { width: totalsW * 0.55 })
       .text(fmt(balance, currency), totalsX + totalsW * 0.55, y, { width: totalsW * 0.45, align: 'right' })

    // ── Notes ──────────────────────────────────────────────────────────────────
    if (invoice.notes?.trim()) {
      y += 20
      doc.moveTo(L, y).lineTo(L + W, y).lineWidth(0.5).strokeColor(BORDER).stroke()
      y += 12
      doc.font('Helvetica-Bold').fontSize(8).fillColor(LIGHT).text('NOTES', L, y)
      y += 13
      doc.font('Helvetica').fontSize(9.5).fillColor(MID).text(invoice.notes, L, y, { width: W, lineGap: 2 })
    }

    // ── Footer ─────────────────────────────────────────────────────────────────
    const pageH = doc.page.height
    doc.rect(0, pageH - 36, doc.page.width, 36).fill('#f8fafc')
    doc.font('Helvetica').fontSize(8.5).fillColor(LIGHT)
       .text(
         `Please reference invoice ${invoice.invoiceNumber} when making payment  ·  Thank you for your business.`,
         L, pageH - 22, { width: W, align: 'center' }
       )

    doc.end()
  })
}
