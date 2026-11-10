import { describe, expect, it } from 'vitest';
import { getScheduleFunctionPath } from '../src/schedule-path-utils';

describe('getScheduleFunctionPath', () => {
  it.each([
    [['jobs', 'nightly'], '_vercel/schedules/jobs/nightly'],
    [['jobs', 'nightly', 'run'], '_vercel/schedules/jobs/nightly/run'],
  ])('creates a readable runtime-neutral path', (segments, expected) => {
    expect(getScheduleFunctionPath(segments)).toBe(expected);
  });

  it('preserves long path segments', () => {
    const segment = 'a'.repeat(200);
    expect(getScheduleFunctionPath(['jobs', segment, 'run'])).toBe(
      `_vercel/schedules/jobs/${segment}/run`
    );
  });

  it.each([
    '',
    '.',
    '..',
    'jobs/nightly',
    'jobs\\nightly',
  ])('rejects unsafe segment %j', segment => {
    expect(() => getScheduleFunctionPath(['jobs', segment])).toThrow(
      'safe, non-empty segments'
    );
  });
});
