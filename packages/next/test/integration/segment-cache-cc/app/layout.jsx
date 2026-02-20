import { cacheTag } from 'next/cache';

async function getTaggedData() {
  'use cache';
  cacheTag('segment-cache-tag');
  return Date.now().toString();
}

export default async function Layout({ children }) {
  const taggedValue = await getTaggedData();
  return (
    <html>
      <body>
        <div id="tagged">tagged:{taggedValue}</div>
        {children}
      </body>
    </html>
  );
}
