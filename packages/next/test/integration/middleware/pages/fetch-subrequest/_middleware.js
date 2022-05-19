import { NextResponse } from 'next/server';

export function middleware(request) {
  const url = request.nextUrl;

  const destinationUrl =
    url.searchParams.get('url') || 'https://example.vercel.sh';
  return fetch(destinationUrl, { headers: request.headers });
}
