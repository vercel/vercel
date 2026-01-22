export function renderBlobSection(): string {
  return `## Vercel Blob Storage

Store and serve files with \`@vercel/blob\`:

### Setup
1. Enable Blob Storage in Dashboard > Storage > Blob
2. Or run: \`vercel blob enable\`
3. Environment variable \`BLOB_READ_WRITE_TOKEN\` is automatically added

### Upload Files

\`\`\`typescript
import { put } from '@vercel/blob';

// Upload from buffer or stream
const { url } = await put('avatars/user-123.png', file, {
  access: 'public',
});

// Upload with custom content type
const { url } = await put('documents/report.pdf', pdfBuffer, {
  access: 'public',
  contentType: 'application/pdf',
});
\`\`\`

### Client-Side Uploads

\`\`\`typescript
// API Route to generate upload URL
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

export async function POST(request: Request) {
  const body = await request.json() as HandleUploadBody;
  
  const jsonResponse = await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async (pathname) => {
      // Validate user can upload
      return {
        allowedContentTypes: ['image/jpeg', 'image/png'],
        maximumSizeInBytes: 10 * 1024 * 1024, // 10MB
      };
    },
    onUploadCompleted: async ({ blob }) => {
      // Save blob URL to database
      console.log('Upload completed:', blob.url);
    },
  });
  
  return Response.json(jsonResponse);
}
\`\`\`

### List and Delete

\`\`\`typescript
import { list, del } from '@vercel/blob';

// List all blobs
const { blobs } = await list();

// List with prefix
const { blobs } = await list({ prefix: 'avatars/' });

// Delete a blob
await del(blobUrl);

// Delete multiple
await del([url1, url2, url3]);
\`\`\`

`;
}
