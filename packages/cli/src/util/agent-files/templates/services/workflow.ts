export function renderWorkflowSection(): string {
  return `## Workflow SDK (Long-running jobs)
\`\`\`typescript
import { serve } from '@vercel/workflow';

export const { POST } = serve(async (step) => {
  const data = await step.run('fetch-data', async () => {
    return await fetchExternalAPI();
  });
  
  await step.sleep('wait', '1h');
  
  await step.run('process', async () => {
    return await processData(data);
  });
});
\`\`\`
Use for: multi-step tasks, retries, delays, jobs >30s. Docs: vercel.com/docs/workflow

`;
}
