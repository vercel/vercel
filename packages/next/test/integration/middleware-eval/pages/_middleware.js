import { NextResponse } from 'next/server';

export function middleware(request) {
  const url = request.nextUrl;

  if (url.pathname === '/eval') {
    eval('2 + 2');
    return NextResponse.next();
  }

  if (url.pathname === '/function') {
    const adder = new Function('a', 'b', 'return a + b');
    return NextResponse.next();
  }

  return NextResponse.next();
}
