import { defineEventHandler, getRouterParam } from 'h3';
// `__NITRO_RUNTIME__` is replaced at injection time with the appropriate runtime
// package: nitro/runtime for v3, nitropack/runtime for v2.
import { runTask } from '__NITRO_RUNTIME__';

export default defineEventHandler(async event => {
  const name = getRouterParam(event, 'name') ?? '';
  return runTask(name, { payload: { scheduledTime: Date.now() }, context: {} });
});
