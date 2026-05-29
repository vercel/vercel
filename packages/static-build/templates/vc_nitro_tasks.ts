import { defineEventHandler, getRouterParam } from 'h3';
// `__NITRO_RUNTIME__` is replaced at injection time with the appropriate runtime
// package: nitro/runtime for v3, nitropack/runtime for v2.
import { runTask } from '__NITRO_RUNTIME__';
import { timingSafeEqual } from 'node:crypto';

export default defineEventHandler(async event => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = getRequestHeader(event, 'authorization') ?? '';
    const expected = `Bearer ${secret}`;
    if (
      auth.length !== expected.length ||
      !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
    ) {
      setResponseStatus(event, 401);
      return { error: 'unauthorized' };
    }
  }
  const name = getRouterParam(event, 'name') ?? '';
  return runTask(name, { payload: { scheduledTime: Date.now() }, context: {} });
});
