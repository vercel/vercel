/* eslint-disable -- flakey application of `global Response` eslint directive */

export const config = { runtime: 'edge' };

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function doSlowWork(pingUrl) {
  // Wait for 1 second: if this waitUntil promise is not awaited before
  // exiting dev server, the pingUrl won't be fetched.
  await sleep(1000);
  await fetch(pingUrl);
}

export default async (req, ctx) => {
  const pingUrl = req.headers.get('x-ping-url');
  if (!pingUrl) {
    throw new Error('x-ping-url is not set');
  }

  ctx.waitUntil(doSlowWork(pingUrl));
  return new Response('running waitUntil promises asynchronously...');
};
