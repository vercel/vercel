export function renderAIGatewaySection(): string {
  return `## AI Gateway (LLM calls)
\`\`\`typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const { text } = await generateText({
  model: openai('gpt-4o'),
  prompt: 'Hello!',
});
\`\`\`
Benefits: caching, rate limiting, observability, fallbacks. Enable in Dashboard > AI.

`;
}
