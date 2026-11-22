import { describe, expect, it } from 'vitest';
import { getV3OutputPath } from '../../src/write-build-result';

describe('getV3OutputPath()', () => {
  it('uses the schedule function output path', () => {
    expect(
      getV3OutputPath({
        src: 'jobs/nightly.ts',
        config: {
          zeroConfig: true,
          scheduleFunction: {
            outputPath: '_vercel/schedules/jobs/nightly',
            entrypoints: [
              {
                entrypoint: 'jobs/nightly.ts',
                sourceFile: 'jobs/nightly.ts',
                scheduleNames: ['nightly'],
              },
            ],
          },
        },
      })
    ).toBe('_vercel/schedules/jobs/nightly');
  });

  it.each([
    '../outside',
    '/outside',
    'C:\\outside',
    'schedules/..',
  ])('rejects unsafe schedule output path %s', outputPath => {
    expect(() =>
      getV3OutputPath({
        src: 'jobs/nightly.ts',
        config: {
          scheduleFunction: {
            outputPath,
            entrypoints: [
              {
                entrypoint: 'jobs/nightly.ts',
                sourceFile: 'jobs/nightly.ts',
                scheduleNames: ['nightly'],
              },
            ],
          },
        },
      })
    ).toThrow('Invalid schedule function output path');
  });
});
