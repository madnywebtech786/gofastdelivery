import 'server-only'
import ExcelJS from 'exceljs'
import { Readable } from 'stream'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const HEADER_ALIASES = {
  email: 'email',
  first_name: 'firstName',
  firstname: 'firstName',
  last_name: 'lastName',
  lastname: 'lastName',
}

/**
 * Loads a worksheet from either a real .xlsx/.xls buffer or a .csv buffer.
 * ExcelJS uses two entirely separate readers (workbook.xlsx.load vs
 * workbook.csv.read) — calling the xlsx reader on CSV bytes throws a "not a
 * zip file" error, so the caller-declared filename decides which to use
 * rather than sniffing content, since a plain-text CSV has no reliable
 * magic-byte signature to detect.
 */
async function loadWorksheet(buffer, filename) {
  const isCsv = /\.csv$/i.test(filename ?? '')
  const workbook = new ExcelJS.Workbook()
  if (isCsv) {
    return workbook.csv.read(Readable.from(buffer))
  }
  await workbook.xlsx.load(buffer)
  return workbook.worksheets[0]
}

/**
 * Parses an uploaded Excel or CSV file buffer into subscriber rows.
 * Expects columns named (case-insensitive, underscore optional): email,
 * first_name/firstname, last_name/lastname. Extra columns are ignored.
 * Rows with a missing or malformed email are collected as errors rather
 * than silently dropped, so the marketer can see exactly what didn't
 * import and why.
 *
 * ExcelJS's row.values is 1-indexed with a leading null at index 0 (column
 * A = values[1]) — the header map below is built from the actual header
 * row rather than assuming fixed column positions, so column order in the
 * uploaded file doesn't matter.
 */
export async function parseSubscriberWorkbook(buffer, filename) {
  let sheet
  try {
    sheet = await loadWorksheet(buffer, filename)
  } catch (err) {
    return { valid: [], errors: [{ row: 0, reason: `Could not read file: ${err.message}` }], totalRows: 0 }
  }
  if (!sheet) {
    return { valid: [], errors: [{ row: 0, reason: 'Workbook has no sheets' }], totalRows: 0 }
  }

  const headerRow = sheet.getRow(1)
  const columnForField = {} // fieldName -> 1-indexed column number
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const key = String(cell.value ?? '').toLowerCase().trim()
    const field = HEADER_ALIASES[key]
    if (field) columnForField[field] = colNumber
  })

  if (!columnForField.email) {
    return { valid: [], errors: [{ row: 1, reason: 'No "email" column found in header row' }], totalRows: 0 }
  }

  const valid = []
  const errors = []
  const totalDataRows = sheet.rowCount - 1

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    if (row.cellCount === 0) continue // skip fully blank rows

    const email     = String(row.getCell(columnForField.email).value ?? '').trim()
    const firstName = columnForField.firstName ? String(row.getCell(columnForField.firstName).value ?? '').trim() || null : null
    const lastName  = columnForField.lastName  ? String(row.getCell(columnForField.lastName).value ?? '').trim() || null  : null

    if (!email) {
      errors.push({ row: rowNumber, reason: 'Missing email' })
      continue
    }
    if (!EMAIL_RE.test(email)) {
      errors.push({ row: rowNumber, reason: `Invalid email format: "${email}"` })
      continue
    }
    valid.push({ email: email.toLowerCase(), firstName, lastName })
  }

  return { valid, errors, totalRows: totalDataRows }
}
