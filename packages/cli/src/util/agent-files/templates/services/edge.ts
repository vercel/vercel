export function renderEdgeSection(): string {
  return `## Edge Runtime
\`\`\`typescript
export const runtime = 'edge';
export default (req: Request) => new Response(\`Hello from \${req.geo?.country}\`);
\`\`\`
Limits: Web APIs only, no fs/child_process, 128KB code size

`;
}
