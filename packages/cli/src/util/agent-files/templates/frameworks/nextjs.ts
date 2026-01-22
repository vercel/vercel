export function renderNextjsSection(): string {
  return `## Next.js on Vercel

### API Routes
Place API routes in \`app/api/*/route.ts\` (App Router) or \`pages/api/*.ts\` (Pages Router):

\`\`\`typescript
// app/api/users/route.ts (App Router)
export async function GET(request: Request) {
  return Response.json({ users: [] });
}

export async function POST(request: Request) {
  const body = await request.json();
  return Response.json({ created: true });
}
\`\`\`

### Server Actions
Use \`'use server'\` directive for form handling and mutations:

\`\`\`typescript
'use server'

export async function submitForm(formData: FormData) {
  const name = formData.get('name');
  // Server-side logic here
}
\`\`\`

### Image Optimization
Always use \`next/image\` for automatic optimization on Vercel's Edge Network:

\`\`\`tsx
import Image from 'next/image';

<Image 
  src="/hero.jpg" 
  width={800} 
  height={600} 
  alt="Hero image"
  priority // Add for above-the-fold images
/>
\`\`\`

### Caching & Revalidation

\`\`\`typescript
// Static with time-based revalidation
export const revalidate = 60; // Revalidate every 60 seconds

// Force dynamic rendering
export const dynamic = 'force-dynamic';

// On-demand revalidation
import { revalidatePath, revalidateTag } from 'next/cache';
revalidatePath('/blog');
revalidateTag('posts');
\`\`\`

### Middleware
Place \`middleware.ts\` in project root for edge-based routing:

\`\`\`typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Add custom headers, redirects, rewrites
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*'],
};
\`\`\`

### Route Segment Config

\`\`\`typescript
// Control function behavior per route
export const runtime = 'edge'; // or 'nodejs'
export const maxDuration = 60; // seconds (depends on plan)
export const preferredRegion = 'iad1'; // or 'auto'
\`\`\`

`;
}
