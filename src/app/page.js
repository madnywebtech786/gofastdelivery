import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'

const ROLE_DASHBOARDS = {
  admin: '/dashboard',
  driver: '/home',
  customer: '/overview',
}

export default async function HomePage() {
  const session = await getSession()

  if (session?.userId && session?.role) {
    const destination = ROLE_DASHBOARDS[session.role] ?? '/login'
    redirect(destination)
  }

  redirect('/login')
}
