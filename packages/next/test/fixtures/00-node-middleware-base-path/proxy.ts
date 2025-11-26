import { NextRequest, NextResponse } from 'next/server'

export default async function proxy(req: NextRequest) {
  const res = NextResponse.next()
  res.headers.set('x-from-proxy', 'true')
  return res
}

export const config = {
  matcher: '/',
}
