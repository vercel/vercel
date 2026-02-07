export function renderStorageSection(): string {
  return `## Storage
\`\`\`typescript
// Blob (files) - npm i @vercel/blob
import { put, del, list } from '@vercel/blob';
const { url } = await put('file.png', file, { access: 'public' });

// Postgres - npm i @vercel/postgres
import { sql } from '@vercel/postgres';
const { rows } = await sql\`SELECT * FROM users WHERE id = \${id}\`;

// Redis (Upstash) - npm i @upstash/redis
import { Redis } from '@upstash/redis';
const redis = Redis.fromEnv();
await redis.set('key', value, { ex: 3600 });
\`\`\`

`;
}
