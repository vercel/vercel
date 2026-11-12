import { Suspense } from 'react';
import { connection } from 'next/server';

// Reading `connection()` is request-time work. Wrapped in a Suspense boundary,
// the route prerenders a static shell and postpones the dynamic hole, so the
// build emits a postponed state alongside the prerendered content.
async function Dynamic() {
  await connection();
  return <div id="needle">resumed</div>;
}

// React records every element enclosing a postponed boundary as a replay node
// in the postponed state, and copies its `key` in verbatim. Keying this list
// item therefore puts `Doppelgänger` into the state itself, whose byte length
// then exceeds its UTF-16 length by the extra byte of the `ä`.
export default function Page() {
  return (
    <ul>
      <li key="Doppelgänger">
        <Suspense fallback={<div id="loading">Loading...</div>}>
          <Dynamic />
        </Suspense>
      </li>
    </ul>
  );
}
