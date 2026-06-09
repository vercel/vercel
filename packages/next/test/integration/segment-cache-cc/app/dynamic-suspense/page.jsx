import { Suspense } from 'react';
import { headers } from 'next/headers';

// Reading `headers()` is request-time work. Wrapped in a Suspense boundary, the
// route prerenders a static shell and postpones the dynamic hole — so its
// `.meta` carries a postponed state and `hasPostponed` should be `true`.
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
