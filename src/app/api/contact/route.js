export async function POST(request) {
  try {
    const body = await request.json()
    const { name, email, phone, message } = body

    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'Invalid email address' }, { status: 400 })
    }

    console.log('[Contact Form]', {
      name,
      email,
      phone: phone || 'not provided',
      message,
    })

    return Response.json({ success: true })
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  return Response.json({ error: 'Method not allowed' }, { status: 405 })
}
