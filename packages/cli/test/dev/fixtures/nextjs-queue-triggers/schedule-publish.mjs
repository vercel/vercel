import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [sdkDirectory, mode = 'manual', topic = 'app-jobs'] = process.argv.slice(2);
assert(sdkDirectory, 'Provide the built @vercel/schedules package directory');
assert(['manual', 'timed'].includes(mode));

// Environment is supplied by the caller before this eager singleton is imported.
// No explicit endpoint/token options: exercise the CLI/SDK local protocol.
const { Schedules } = await import(
  pathToFileURL(resolve(sdkDirectory, 'dist/index.js')).href
);
const id = {
  name: `${mode}-${Date.now()}-${process.pid}`,
  namespace: 'local-sdk-smoke',
};
const at = new Date(Date.now() + (mode === 'timed' ? 5000 : 3600000))
  .toISOString()
  .slice(0, 19);
const payload = { testId: id.name, mode, version: 'created' };
const schedule = await Schedules.create({
  ...id,
  expression: { type: 'single', at },
  timezone: 'UTC',
  target: { topic },
  payload,
});
assert.equal(schedule.state, 'active');
assert.equal((await Schedules.get(id)).scheduleId, schedule.scheduleId);
assert(
  (await Schedules.list({ namespace: id.namespace, limit: 100 })).data.some(
    entry => entry.scheduleId === schedule.scheduleId
  )
);

if (mode === 'manual') {
  assert.equal((await Schedules.disable(id)).state, 'inactive');
  payload.version = 'updated';
  await Schedules.update({ ...id, payload, jitter: null });
  assert.equal((await Schedules.enable(id)).state, 'active');
  assert.equal((await Schedules.disable(id)).state, 'inactive');
  await Schedules.invoke(id);
  // Deleting the schedule must not retract a message already accepted by Queues.
  await Schedules.delete(id);
  await assert.rejects(() => Schedules.get(id), error => error.status === 404);
}

console.log(JSON.stringify({ ...id, scheduleId: schedule.scheduleId, at, payload }));
