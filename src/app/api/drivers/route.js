import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireAdmin, handleApiError } from '@/lib/dal'
import { findAllDrivers, findActiveRoute } from '@/lib/db/drivers'
import { createUser, emailExists } from '@/lib/db/users'
import { nanoid } from 'nanoid'

export async function GET() {
  try {
    await requireAdmin()
    const drivers = await findAllDrivers()

    // Annotate each driver with how many pending stops they currently have
    // so the admin can see which drivers are already loaded before assigning more.
    const annotated = await Promise.all(
      drivers.map(async (d) => {
        const route = await findActiveRoute(String(d._id))
        const pendingStopCount = route
          ? (route.optimizedStops ?? []).filter((s) => !s.completedAt).length
          : 0
        return { ...d, pendingStopCount }
      })
    )

    return NextResponse.json(JSON.parse(JSON.stringify(annotated)))
  } catch (err) {
    return handleApiError(err, '[GET /api/drivers]')
  }
}

export async function POST(request) {
  try {
    await requireAdmin()

    const { name, email, phone, vehicleType } = await request.json()

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
    }

    const validVehicles = ['motorcycle', 'car', 'van']
    if (vehicleType && !validVehicles.includes(vehicleType)) {
      return NextResponse.json({ error: 'Invalid vehicle type' }, { status: 400 })
    }

    // Check email uniqueness
    const exists = await emailExists(email)
    if (exists) {
      return NextResponse.json({ error: 'Email is already registered' }, { status: 409 })
    }

    // Generate a secure temporary password
    // Format: 3 random words pattern → e.g., "Xk9mP2nQ" (readable, secure enough for temp use)
    const tempPassword = nanoid(10)
    const passwordHash = await bcrypt.hash(tempPassword, 12)

    const user = await createUser({
      email,
      passwordHash,
      name,
      phone: phone || null,
      role: 'driver',
      driverProfile: {
        vehicleType: vehicleType ?? 'motorcycle',
        isOnDuty: false,
        currentLocation: null,
        activeAssignmentId: null,
      },
    })

    // Return temp password in this response ONLY — never stored in plaintext
    return NextResponse.json(
      {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        tempPassword, // Shown once to admin
      },
      { status: 201 }
    )
  } catch (err) {
    return handleApiError(err, '[POST /api/drivers]')
  }
}
