export function renderEdgeSection(): string {
  return `## Edge Runtime

\`\`\`typescript
export const runtime = 'edge';  // or config = { runtime: 'edge' }

export default function handler(req: Request) {
  const country = req.geo?.country;
  return new Response(\`Hello from \${country}\`);
}
\`\`\`

**Limits:** Web APIs only, no Node.js fs/child_process, 128KB code size

`;
}
