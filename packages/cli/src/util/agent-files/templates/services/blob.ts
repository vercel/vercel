export function renderBlobSection(): string {
  return `## Blob Storage
\`\`\`typescript
import { put, del, list } from '@vercel/blob';
const { url } = await put('file.png', file, { access: 'public' });
\`\`\`
Setup: Dashboard > Storage > Blob

`;
}
