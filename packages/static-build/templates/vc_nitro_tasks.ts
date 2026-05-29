// @ts-ignore — resolved by Nitro's rollup plugin (nitro v3 and nitropack v2).
// Importing scheduledTasks forces the task runtime and handler chunks into the
// production bundle, which is otherwise tree-shaken by the vercel preset.
import { scheduledTasks } from '#nitro-internal-virtual/tasks';
import { timingSafeEqual } from 'node:crypto';

export default defineEventHandler(async event => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = getRequestHeader(event, 'authorization') ?? '';
    const expected = `Bearer ${cronSecret}`;
    if (
      auth.length !== expected.length ||
      !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
    ) {
      setResponseStatus(event, 401);
      return { error: 'unauthorized' };
    }
  }

  const cron = getRequestHeader(event, 'x-vercel-cron-schedule');
  const schedule = (scheduledTasks || []).find(s => s.cron === cron);
  await Promise.all(
    (schedule?.tasks || []).map(name =>
      runTask(name, { payload: { scheduledTime: Date.now() }, context: {} })
    )
  );
  return { ok: true };
});
