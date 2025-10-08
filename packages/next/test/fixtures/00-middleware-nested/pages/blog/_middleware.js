import { NextResponse } from 'next/server';

export const middleware = async () => {
  // Just chillin doing nothing
  return NextResponse.next();
};
