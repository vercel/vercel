import { NextResponse } from 'next/server';
export function GET(req) {
    console.log('🧪 app-router')
    // console.log('🧪 app-router req.headers', JSON.stringify(req.headers, null, 2))
    console.log('🧪 app-router req.headers', req.headers);
    return NextResponse.json({ 'port': req.headers.get('x-forwarded-port') });
  }
  