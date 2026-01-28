export function renderAIIntegrationsSection(): string {
  return `## AI & Integrations
\`\`\`typescript
// AI Gateway - caching, rate limiting, observability
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
const { text } = await generateText({ model: openai('gpt-4o'), prompt: 'Hello!' });
\`\`\`
**Marketplace** (vercel.com/marketplace): Databases (Neon, Supabase), Auth (Clerk), Email (Resend), Monitoring (Sentry)

`;
}
