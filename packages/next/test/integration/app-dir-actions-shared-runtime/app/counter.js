'use client';

import { useState } from 'react';
import { increment } from './actions';

export default function Counter() {
  const [count, setCount] = useState(0);

  return (
    <form action={async () => setCount(await increment(count))}>
      <div id="count">{count}</div>
      <button>Submit</button>
    </form>
  );
}
