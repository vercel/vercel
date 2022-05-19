import { NextResponse } from 'next/server';

export function middleware(request) {
  const url = request.nextUrl;
  if (!request.cookies.bucket) {
    const bucket = Math.random() >= 0.5 ? 'a' : 'b';
    url.pathname = `/home/${bucket}`;
    const response = NextResponse.rewrite(url);
    response.cookie('bucket', bucket);
    return response;
  }

  url.pathname = `/home/${request.cookies.bucket}`;
  return NextResponse.rewrite(url);
}
