import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireAdmin, handleApiError } from '@/lib/dal'
import { findDriverById } from '@/lib/db/drivers'
import { resetPasswordByUserId } from '@/lib/db/users'

const MAX_PW_BYTES = 72  // bcrypt truncates beyond this

export async function POST(request, { params }) {
  try {
    await requireAdmin()
    const { driverId } = await params
    const { newPassword } = await request.json()

    if (!newPassword) {
      return NextResponse.json({ error: 'New password is required.' }, { status: 400 })
    }

    if (Buffer.byteLength(newPassword, 'utf8') > MAX_PW_BYTES) {
      return NextResponse.json(
        { error: 'Password is too long (max 72 characters).' },
        { status: 400 }
      )
    }

    // Same strength rules as /api/user/password: min 8, 1 uppercase, 1 number, 1 special
    if (
      newPassword.length < 8 ||
      !/[A-Z]/.test(newPassword) ||
      !/[0-9]/.test(newPassword) ||
      !/[^A-Za-z0-9]/.test(newPassword)
    ) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters and include an uppercase letter, a number, and a special character.' },
        { status: 400 }
      )
    }

    const driver = await findDriverById(driverId)
    if (!driver) {
      return NextResponse.json({ error: 'Driver not found.' }, { status: 404 })
    }

    const hash = await bcrypt.hash(newPassword, 12)
    const result = await resetPasswordByUserId(String(driver._id), hash)

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Driver not found or inactive.' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return handleApiError(err, '[POST /api/drivers/[driverId]/reset-password]')
  }
}
