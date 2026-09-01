import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireAdmin, handleApiError } from '@/lib/dal'
import { createUser, emailExists, findUsersByRole } from '@/lib/db/users'
import { nanoid } from 'nanoid'

export async function GET() {
  try {
    await requireAdmin()
    const marketers = await findUsersByRole('email_marketer')
    return NextResponse.json(JSON.parse(JSON.stringify(marketers)))
  } catch (err) {
    return handleApiError(err, '[GET /api/marketers]')
  }
}

export async function POST(request) {
  try {
    await requireAdmin()

    const { name, email, phone } = await request.json()

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
    }

    const exists = await emailExists(email)
    if (exists) {
      return NextResponse.json({ error: 'Email is already registered' }, { status: 409 })
    }

    // Generate a secure temporary password — same pattern as driver creation
    // (src/app/api/drivers/route.js): a random nanoid, never stored in
    // plaintext, shown to the admin exactly once in this response.
    const tempPassword = nanoid(10)
    const passwordHash = await bcrypt.hash(tempPassword, 12)

    const user = await createUser({
      email,
      passwordHash,
      name,
      phone: phone || null,
      role: 'email_marketer',
    })

    return NextResponse.json(
      {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        tempPassword,
      },
      { status: 201 }
    )
  } catch (err) {
    return handleApiError(err, '[POST /api/marketers]')
  }
}
