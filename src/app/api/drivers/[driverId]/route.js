import { NextResponse } from 'next/server'
import { requireAdmin, handleApiError } from '@/lib/dal'
import { findDriverById } from '@/lib/db/drivers'
import { emailExists, updateDriverInfo } from '@/lib/db/users'

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function PATCH(request, { params }) {
  try {
    await requireAdmin()
    const { driverId } = await params
    const { name, email, phone } = await request.json()

    const driver = await findDriverById(driverId)
    if (!driver) {
      return NextResponse.json({ error: 'Driver not found.' }, { status: 404 })
    }

    const cleanName  = String(name ?? '').trim()
    const cleanEmail = String(email ?? '').trim()
    const cleanPhone = String(phone ?? '').trim()

    if (!cleanName || !cleanEmail) {
      return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 })
    }
    if (!isValidEmail(cleanEmail)) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 })
    }

    // Only check uniqueness if the email is actually changing — otherwise a
    // driver's own existing email would always "conflict" with themselves.
    if (cleanEmail.toLowerCase() !== driver.email.toLowerCase()) {
      const exists = await emailExists(cleanEmail)
      if (exists) {
        return NextResponse.json({ error: 'Email is already registered to another account.' }, { status: 409 })
      }
    }

    const updated = await updateDriverInfo(driverId, {
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone || null,
    })

    return NextResponse.json(JSON.parse(JSON.stringify(updated)))
  } catch (err) {
    return handleApiError(err, '[PATCH /api/drivers/[driverId]]')
  }
}
