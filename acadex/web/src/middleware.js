import { NextResponse } from 'next/server'

// Role-based route guard: /student, /teacher and /admin need a matching role cookie.
export function middleware(req) {
  const role = req.cookies.get('acadex_role')?.value
  const area = req.nextUrl.pathname.split('/')[1]
  if (!role) return NextResponse.redirect(new URL('/', req.url))
  if (role !== area) return NextResponse.redirect(new URL(`/${role}`, req.url))
  return NextResponse.next()
}
export const config = { matcher: ['/student/:path*', '/teacher/:path*', '/admin/:path*'] }
