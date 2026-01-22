export function renderKVSection(): string {
  return `## Redis / Key-Value Storage (Upstash)

> **Note**: Vercel KV is deprecated. Use **Upstash Redis** for new projects.

Upstash provides serverless Redis with a REST API, perfect for Vercel deployments:

### Setup
1. Add Upstash Redis via Vercel Marketplace: https://vercel.com/marketplace/upstash
2. Or create directly at https://upstash.com and add environment variables
3. Environment variables are automatically added:
   - \`UPSTASH_REDIS_REST_URL\`
   - \`UPSTASH_REDIS_REST_TOKEN\`

### Installation

\`\`\`bash
npm install @upstash/redis
\`\`\`

### Basic Operations

\`\`\`typescript
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// Set a value
await redis.set('user:123', { name: 'Alice', email: 'alice@example.com' });

// Set with expiration (in seconds)
await redis.set('session:abc', sessionData, { ex: 3600 }); // 1 hour

// Get a value
const user = await redis.get('user:123');

// Delete a value
await redis.del('user:123');

// Check if key exists
const exists = await redis.exists('user:123');
\`\`\`

### Hash Operations

\`\`\`typescript
// Set hash fields
await redis.hset('user:123', { name: 'Alice', age: 30 });

// Get hash field
const name = await redis.hget('user:123', 'name');

// Get all hash fields
const user = await redis.hgetall('user:123');
\`\`\`

### List Operations

\`\`\`typescript
// Push to list
await redis.lpush('notifications:123', 'New message');
await redis.rpush('queue', 'task-1');

// Get range
const items = await redis.lrange('notifications:123', 0, 9); // First 10

// Pop from list
const task = await redis.lpop('queue');
\`\`\`

### Sorted Sets (Leaderboards)

\`\`\`typescript
// Add to sorted set
await redis.zadd('leaderboard', { score: 100, member: 'player1' });

// Get top 10
const top10 = await redis.zrange('leaderboard', 0, 9, { rev: true });

// Get rank
const rank = await redis.zrank('leaderboard', 'player1');
\`\`\`

### Rate Limiting with Upstash

\`\`\`typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'), // 10 requests per 10 seconds
});

// In your API route
const { success } = await ratelimit.limit(identifier);
if (!success) {
  return new Response('Rate limited', { status: 429 });
}
\`\`\`

`;
}
