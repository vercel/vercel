export function renderBlobSection(): string {
  return `## Blob Storage

\`\`\`typescript
import { put, del, list } from '@vercel/blob';

const { url } = await put('file.png', file, { access: 'public' });
await del(url);
const { blobs } = await list({ prefix: 'uploads/' });
\`\`\`

**Setup:** Dashboard > Storage > Blob (adds \`BLOB_READ_WRITE_TOKEN\`)

`;
}
