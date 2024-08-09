// Edge functions can not use child processes, but this is route
// uses Node.js. So this is here to verify that bundle splitting
// is working correctly (because this route should not exist in
// the Edge bundle).
import { exec } from 'child_process';

import { json } from '@remix-run/node';

export async function loader() {
  const hi = await new Promise<string>((resolve, reject) => {
    exec(
      `echo hi from the B page running in ${process.env.VERCEL_REGION}`,
      (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout);
      }
    );
  });
  return json({ hi });
}
