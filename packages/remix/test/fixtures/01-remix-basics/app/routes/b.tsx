// Edge functions can not use child processes, but this is route
// uses Node.js. So this is here to verify that bundle splitting
// is working correctly (because this route should not exist in
// the Edge bundle).
import { exec } from 'node:child_process';

import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';

export async function loader() {
  const hi = await new Promise<string>((resolve, reject) => {
    exec('echo hi', (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout);
    });
  });
  return json({ hi });
};

export default function B() {
  const { hi } = useLoaderData<typeof loader>();
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.4" }}>
      <h1>B page</h1>
      <p>{hi}</p>
    </div>
  );
}
