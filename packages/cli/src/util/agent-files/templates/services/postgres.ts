export function renderPostgresSection(): string {
  return `## Vercel Postgres

Serverless PostgreSQL database:

### Setup
1. Create database in Dashboard > Storage > Postgres
2. Environment variables are automatically added:
   - \`POSTGRES_URL\`
   - \`POSTGRES_PRISMA_URL\`
   - \`POSTGRES_URL_NON_POOLING\`

### Using @vercel/postgres

\`\`\`typescript
import { sql } from '@vercel/postgres';

// Query with tagged template
const { rows } = await sql\`SELECT * FROM users WHERE id = \${userId}\`;

// Insert data
await sql\`
  INSERT INTO users (name, email) 
  VALUES (\${name}, \${email})
\`;

// Update data
await sql\`
  UPDATE users 
  SET name = \${newName} 
  WHERE id = \${userId}
\`;

// Delete data
await sql\`DELETE FROM users WHERE id = \${userId}\`;
\`\`\`

### Using with Prisma

\`\`\`typescript
// schema.prisma
datasource db {
  provider  = "postgresql"
  url       = env("POSTGRES_PRISMA_URL")
  directUrl = env("POSTGRES_URL_NON_POOLING")
}

// Usage
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const users = await prisma.user.findMany();
\`\`\`

### Using with Drizzle

\`\`\`typescript
import { drizzle } from 'drizzle-orm/vercel-postgres';
import { sql } from '@vercel/postgres';

const db = drizzle(sql);

const users = await db.select().from(usersTable);
\`\`\`

### Connection Pooling
- Use \`POSTGRES_URL\` for pooled connections (recommended)
- Use \`POSTGRES_URL_NON_POOLING\` for migrations and schema changes

`;
}
