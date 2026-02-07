export function renderComputeSection(): string {
  return `## Compute
\`\`\`typescript
// Cron - vercel.json: { "crons": [{ "path": "/api/cron", "schedule": "0 0 * * *" }] }
// Secure with: Authorization: Bearer \${CRON_SECRET}

// Edge Runtime - fast, global, limited APIs
export const runtime = 'edge';
export default (req: Request) => new Response('Hello from edge');

// Workflow SDK (long-running jobs) - npm i @vercel/workflow
import { serve } from '@vercel/workflow';
export const { POST } = serve(async (step) => {
  const data = await step.run('fetch', () => fetchAPI());
  await step.sleep('wait', '1h');
  await step.run('process', () => process(data));
});
\`\`\`

`;
}
