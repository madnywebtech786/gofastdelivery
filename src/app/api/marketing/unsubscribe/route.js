import { NextResponse } from 'next/server'
import { unsubscribeByToken } from '@/lib/db/marketingSubscribers'

export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/unsubscribe?result=invalid', request.url))
  }
  const found = await unsubscribeByToken(token)
  return NextResponse.redirect(new URL(`/unsubscribe?result=${found ? 'success' : 'invalid'}`, request.url))
}
