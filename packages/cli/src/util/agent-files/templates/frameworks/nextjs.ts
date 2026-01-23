export function renderNextjsSection(): string {
  return `## Next.js
\`\`\`typescript
// API: app/api/*/route.ts → export async function GET(req: Request) { return Response.json({}) }
// Actions: 'use server' → export async function submit(formData: FormData) {}
// Config: export const revalidate = 60 | dynamic = 'force-dynamic' | runtime = 'edge'
\`\`\`

`;
}
