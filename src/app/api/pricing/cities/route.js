import { NextResponse } from 'next/server'
import { requireAdmin, handleApiError } from '@/lib/dal'
import { getAllCities, upsertCity, deleteCity } from '@/lib/db/pricing'

const VALID_ZONES = ['calgary', 'satellite', 'regional']

export async function GET() {
  try {
    await requireAdmin()
    const cities = await getAllCities()
    return NextResponse.json(JSON.parse(JSON.stringify(cities)))
  } catch (err) {
    return handleApiError(err, '[GET /api/pricing/cities]')
  }
}

export async function POST(request) {
  try {
    await requireAdmin()
    const { name, zone } = await request.json()
    if (!name || !zone) {
      return NextResponse.json({ error: 'name and zone are required' }, { status: 400 })
    }
    if (!VALID_ZONES.includes(zone)) {
      return NextResponse.json({ error: `zone must be one of ${VALID_ZONES.join(', ')}` }, { status: 400 })
    }
    await upsertCity({ name, zone })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err, '[POST /api/pricing/cities]')
  }
}

export async function DELETE(request) {
  try {
    await requireAdmin()
    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    await deleteCity(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err, '[DELETE /api/pricing/cities]')
  }
}
