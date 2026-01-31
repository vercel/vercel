export function renderPostgresSection(): string {
  return `## Postgres
\`\`\`typescript
import { sql } from '@vercel/postgres';
const { rows } = await sql\`SELECT * FROM users WHERE id = \${id}\`;
\`\`\`
Prisma: use \`POSTGRES_PRISMA_URL\` (pooled), \`POSTGRES_URL_NON_POOLING\` (migrations)

`;
}
