export function renderEdgeSection(): string {
  return `## Edge Functions

Run code at the edge for low-latency responses:

### Enable Edge Runtime

\`\`\`typescript
// Next.js App Router
export const runtime = 'edge';

// Next.js Pages Router / API Routes
export const config = {
  runtime: 'edge',
};

// Standalone Edge Function
export const config = {
  runtime: 'edge',
};

export default function handler(request: Request) {
  return new Response('Hello from the Edge!');
}
\`\`\`

### Edge Runtime Limitations
- No Node.js filesystem APIs (\`fs\`, \`path\` with fs operations)
- No native Node.js modules (\`child_process\`, \`crypto\` with some methods)
- Limited to Web APIs and Edge-compatible npm packages
- 128KB code size limit (after compression)

### Supported APIs
- \`fetch\`, \`Request\`, \`Response\`
- \`URL\`, \`URLSearchParams\`
- \`TextEncoder\`, \`TextDecoder\`
- \`crypto.subtle\` (Web Crypto API)
- \`Headers\`, \`FormData\`
- \`ReadableStream\`, \`WritableStream\`

### Edge Middleware

\`\`\`typescript
// middleware.ts (project root)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Geolocation
  const country = request.geo?.country || 'US';
  
  // Rewrite based on location
  if (country === 'DE') {
    return NextResponse.rewrite(new URL('/de', request.url));
  }
  
  // Add headers
  const response = NextResponse.next();
  response.headers.set('x-custom-header', 'value');
  
  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|favicon.ico).*)'],
};
\`\`\`

### Edge Config (Feature Flags)

\`\`\`typescript
import { get } from '@vercel/edge-config';

export const config = { runtime: 'edge' };

export default async function handler() {
  const greeting = await get('greeting');
  return new Response(greeting);
}
\`\`\`

`;
}
