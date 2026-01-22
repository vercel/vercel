export function renderNextjsSection(): string {
  return `## Next.js

**API Routes:** \`app/api/*/route.ts\`
\`\`\`typescript
export async function GET(request: Request) {
  return Response.json({ data: [] });
}
\`\`\`

**Server Actions:**
\`\`\`typescript
'use server'
export async function submit(formData: FormData) { /* ... */ }
\`\`\`

**Caching:**
\`\`\`typescript
export const revalidate = 60;        // ISR: revalidate every 60s
export const dynamic = 'force-dynamic'; // Disable caching
\`\`\`

**Route Config:**
\`\`\`typescript
export const runtime = 'edge';       // Run on edge
export const maxDuration = 60;       // Max execution time (seconds)
\`\`\`

`;
}
