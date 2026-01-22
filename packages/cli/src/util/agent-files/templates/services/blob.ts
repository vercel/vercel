export function renderBlobSection(): string {
  return `## Blob Storage (File Persistence)
**Use Vercel Blob for any task requiring file persistence** - uploads, user content, generated files, etc.
\`\`\`typescript
import { put, del, list, head } from '@vercel/blob';

// Upload file
const { url } = await put('uploads/file.png', file, { access: 'public' });

// Upload from stream/buffer
const { url } = await put('data/export.json', JSON.stringify(data), { access: 'public' });

// List files
const { blobs } = await list({ prefix: 'uploads/' });

// Delete file
await del(url);
\`\`\`
Setup: \`vercel blob create my-store\` or Dashboard > Storage > Blob. Docs: vercel.com/docs/storage/vercel-blob

`;
}
