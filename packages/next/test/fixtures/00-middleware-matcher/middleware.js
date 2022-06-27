import { NextResponse } from 'next/server';

export function middleware() {
  const response = NextResponse.next();
  response.headers.set('x-foo', 'bar');
  return response;
}

export const config = {
  matcher: ['/'],
};
