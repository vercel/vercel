export function renderKVSection(): string {
  return `## Vercel KV (Redis)

Key-value storage with Redis-compatible API:

### Setup
1. Create KV store in Dashboard > Storage > KV
2. Environment variables are automatically added:
   - \`KV_URL\`
   - \`KV_REST_API_URL\`
   - \`KV_REST_API_TOKEN\`
   - \`KV_REST_API_READ_ONLY_TOKEN\`

### Basic Operations

\`\`\`typescript
import { kv } from '@vercel/kv';

// Set a value
await kv.set('user:123', { name: 'Alice', email: 'alice@example.com' });

// Set with expiration (in seconds)
await kv.set('session:abc', sessionData, { ex: 3600 }); // 1 hour

// Get a value
const user = await kv.get('user:123');

// Delete a value
await kv.del('user:123');

// Check if key exists
const exists = await kv.exists('user:123');
\`\`\`

### Hash Operations

\`\`\`typescript
// Set hash fields
await kv.hset('user:123', { name: 'Alice', age: 30 });

// Get hash field
const name = await kv.hget('user:123', 'name');

// Get all hash fields
const user = await kv.hgetall('user:123');
\`\`\`

### List Operations

\`\`\`typescript
// Push to list
await kv.lpush('notifications:123', 'New message');
await kv.rpush('queue', 'task-1');

// Get range
const items = await kv.lrange('notifications:123', 0, 9); // First 10

// Pop from list
const task = await kv.lpop('queue');
\`\`\`

### Sorted Sets (Leaderboards)

\`\`\`typescript
// Add to sorted set
await kv.zadd('leaderboard', { score: 100, member: 'player1' });

// Get top 10
const top10 = await kv.zrange('leaderboard', 0, 9, { rev: true });

// Get rank
const rank = await kv.zrank('leaderboard', 'player1');
\`\`\`

`;
}
