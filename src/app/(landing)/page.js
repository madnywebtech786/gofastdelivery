import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import LandingPage from '@/components/landing/LandingPage'

const ROLE_DASHBOARDS = {
  admin:    '/admin/dashboard',
  driver:   '/driver/home',
  customer: '/customer/overview',
}

export const metadata = {
  title: "GoFastDelivery — Calgary's Same-Day Courier Service",
  description: 'Fast, reliable same-day delivery across Calgary and surrounding areas. Book a pickup in minutes.',
}

export default async function HomePage() {
  const session = await getSession()
  if (session?.userId && session?.role) {
    redirect(ROLE_DASHBOARDS[session.role] ?? '/login')
  }
  return <LandingPage />
}
