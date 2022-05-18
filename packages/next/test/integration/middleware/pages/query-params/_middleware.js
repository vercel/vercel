// @ts-check

import { NextResponse } from 'next/server';

const ALLOWED = ['allowed'];

/**
 * @param {import('next/server').NextRequest} req
 */
export default async function middleware(req) {
  const url = req.nextUrl;
  const pathname = url.pathname;

  if (pathname.endsWith('/clear')) {
    const strategy =
      url.searchParams.get('strategy') === 'rewrite' ? 'rewrite' : 'redirect';

    for (const key of [...url.searchParams.keys()]) {
      if (!ALLOWED.includes(key)) {
        url.searchParams.delete(key);
      }
    }

    const newPath = url.pathname.replace(/\/clear$/, '');
    url.pathname = newPath;

    if (strategy === 'redirect') {
      return NextResponse.redirect(url);
    } else {
      return NextResponse.rewrite(url);
    }
  }

  const obj = Object.fromEntries([...url.searchParams.entries()]);

  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
