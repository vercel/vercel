import { Suspense } from 'react';
import { headers } from 'next/headers';

// Reading `headers()` is request-time work. Wrapped in a Suspense boundary, the
// route prerenders a static shell and postpones the dynamic hole — so Next.js
// classifies it as an `initial` response that a request has to resume.
async function Dynamic() {
  const list = await headers();
  return <div id="needle">ua:{list.get('user-agent') ?? 'null'}</div>;
}

export default function Page() {
  return (
    <Suspense fallback={<div id="loading">Loading...</div>}>
      <Dynamic />
    </Suspense>
  );
}
