export function renderKVSection(): string {
  return `## Redis (Upstash)

> **Vercel KV is deprecated.** Use Upstash Redis.

\`\`\`typescript
import { Redis } from '@upstash/redis';
const redis = Redis.fromEnv();

await redis.set('key', value, { ex: 3600 }); // 1hr expiry
const val = await redis.get('key');
await redis.del('key');
\`\`\`

**Rate limiting:**
\`\`\`typescript
import { Ratelimit } from '@upstash/ratelimit';
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10s'),
});
const { success } = await ratelimit.limit(userId);
\`\`\`

**Setup:** https://vercel.com/marketplace/upstash

`;
}
