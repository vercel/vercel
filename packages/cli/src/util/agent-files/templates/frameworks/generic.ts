export function renderGenericFrameworkSection(): string {
  return `## Serverless Functions

### Creating Functions
Place functions in the \`api/\` directory:

\`\`\`typescript
// api/hello.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ message: 'Hello World' });
}
\`\`\`

### Function Configuration
Configure functions in \`vercel.json\`:

\`\`\`json
{
  "functions": {
    "api/heavy-task.ts": {
      "maxDuration": 60,
      "memory": 1024
    }
  }
}
\`\`\`

### Edge Functions
For low-latency global responses:

\`\`\`typescript
// api/edge-function.ts
export const config = {
  runtime: 'edge',
};

export default function handler(request: Request) {
  return new Response('Hello from the Edge!');
}
\`\`\`

`;
}
