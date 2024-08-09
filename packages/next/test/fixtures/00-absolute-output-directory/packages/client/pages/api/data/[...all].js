import { NextResponse } from 'next/server';

export default function handler(req) {
  return NextResponse.json({ hello: 'world', now: Date.now(), url: req.url });
}

export const config = {
  runtime: 'edge',
};
