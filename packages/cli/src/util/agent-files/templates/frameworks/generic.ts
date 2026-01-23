export function renderGenericFrameworkSection(): string {
  return `## API Routes
\`\`\`typescript
// api/hello.ts → export default (req, res) => res.json({ message: 'Hello' })
// Edge: export const config = { runtime: 'edge' }
\`\`\`

`;
}
