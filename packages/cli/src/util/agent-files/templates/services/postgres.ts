export function renderPostgresSection(): string {
  return `## Postgres

\`\`\`typescript
import { sql } from '@vercel/postgres';
const { rows } = await sql\`SELECT * FROM users WHERE id = \${id}\`;
\`\`\`

**With Prisma:** Use \`POSTGRES_PRISMA_URL\` (pooled) and \`POSTGRES_URL_NON_POOLING\` (migrations)

**Setup:** Dashboard > Storage > Postgres

`;
}
