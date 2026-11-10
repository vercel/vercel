import { describe, expect, test } from 'vitest';
import { parseScheduleEntrypoint } from '../src/entrypoint';

describe('parseScheduleEntrypoint', () => {
  test.each([
    'js',
    'mjs',
    'cjs',
    'ts',
    'mts',
    'cts',
  ])('parses a .%s Node.js file entrypoint', extension => {
    expect(parseScheduleEntrypoint(`jobs/nightly.${extension}`)).toEqual({
      runtime: 'node',
      filePath: `jobs/nightly.${extension}`,
    });
  });

  test.each([
    'jobs/nightly',
    'jobs/nightly.ts:run',
    '/jobs/nightly.ts',
    '../jobs/nightly.ts',
    'jobs/../nightly.ts',
    'jobs/nightly.tsx',
    'jobs/nightly.d.ts',
    'jobs/nightly.d.mts',
    'jobs/nightly.d.cts',
  ])('rejects unsupported Node.js entrypoint %s', entrypoint => {
    expect(parseScheduleEntrypoint(entrypoint)).toBeNull();
  });

  test('parses a Python script entrypoint', () => {
    expect(parseScheduleEntrypoint('jobs/nightly.py')).toEqual({
      runtime: 'python',
      filePath: 'jobs/nightly.py',
    });
  });

  test.each([
    'jobs.nightly:run',
    '../jobs/nightly.py',
    '/jobs/nightly.py',
  ])('rejects unsupported Python entrypoint %s', entrypoint => {
    expect(parseScheduleEntrypoint(entrypoint)).toBeNull();
  });
});
