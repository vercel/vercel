export function renderNextjsSection(): string {
  return `## Next.js
\`\`\`typescript
// app/api/*/route.ts
export async function GET(req: Request) {
  return Response.json({ data: [] });
}

// Server Action
'use server'
export async function submit(formData: FormData) { /* ... */ }

// Caching
export const revalidate = 60;           // ISR
export const dynamic = 'force-dynamic'; // No cache
export const runtime = 'edge';          // Edge runtime
\`\`\`

`;
}
