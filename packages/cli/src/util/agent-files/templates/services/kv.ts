export function renderKVSection(): string {
  return `## Redis (Upstash) — *Vercel KV is deprecated*
\`\`\`typescript
import { Redis } from '@upstash/redis';
const redis = Redis.fromEnv();
await redis.set('key', value, { ex: 3600 });
const val = await redis.get('key');
\`\`\`
Setup: vercel.com/marketplace/upstash

`;
}
