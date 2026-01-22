export function renderGenericFrameworkSection(): string {
  return `## Serverless Functions

Place functions in \`api/\` directory:
\`\`\`typescript
// api/hello.ts
export default function handler(req, res) {
  res.status(200).json({ message: 'Hello' });
}
\`\`\`

**Edge Function:**
\`\`\`typescript
export const config = { runtime: 'edge' };
export default (req: Request) => new Response('Hello from Edge');
\`\`\`

`;
}
