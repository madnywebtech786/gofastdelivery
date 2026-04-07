import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { findUserByEmail } from '@/lib/db/users'
import { createSession } from '@/lib/session'
import { checkRateLimit } from '@/lib/redis'

export async function POST(request) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    // Rate limit: max 10 login attempts per IP per 15 minutes
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const { allowed } = await checkRateLimit(`rate:login:${ip}`, 10, 900)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again in 15 minutes.' },
        { status: 429 }
      )
    }

    const user = await findUserByEmail(email)

    // Use constant-time comparison to prevent timing attacks
    // If user not found, compare against a dummy hash to avoid early exit timing leak
    const dummyHash = '$2b$12$invalidhashfortimingattackprevention000000000000000000'
    const hashToCompare = user?.passwordHash ?? dummyHash
    const passwordMatch = await bcrypt.compare(password, hashToCompare)

    if (!user || !passwordMatch || !user.isActive) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    await createSession(user._id, user.role)

    return NextResponse.json({ role: user.role }, { status: 200 })
  } catch (err) {
    console.error('[POST /api/auth/login]', err)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
