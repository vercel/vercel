import { afterEach, describe, expect, it } from 'vitest';
import { NowBuildError } from '@vercel/build-utils';
import {
  assertBuildProcessIdle,
  createBuildResourceTracker,
  snapshotBuildProcessState,
} from '../../../../src/util/build/assert-build-idle';

describe('assert-build-idle', () => {
  let interval: ReturnType<typeof setInterval> | undefined;
  let tracker: ReturnType<typeof createBuildResourceTracker>;

  afterEach(() => {
    tracker?.stop();
    if (interval) {
      clearInterval(interval);
      interval = undefined;
    }
  });

  it('errors when a new active timer remains after the build', async () => {
    tracker = createBuildResourceTracker();
    tracker.start();
    const before = snapshotBuildProcessState();
    interval = setInterval(() => {}, 60_000);

    const error = await assertBuildProcessIdle(before, tracker).catch(
      err => err
    );
    expect(error).toBeInstanceOf(NowBuildError);
    expect(error).toMatchObject({
      code: 'BUILD_PROCESS_HANG',
      message: expect.stringContaining('Timeout'),
    });
  });
});
