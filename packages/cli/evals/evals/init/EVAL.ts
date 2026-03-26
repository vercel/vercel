import { existsSync } from 'fs';
import { test, expect } from 'vitest';

test('build completed successfully', () => {
  expect(existsSync('project/package.json')).toBe(true);
  expect(existsSync('project/next.config.ts')).toBe(true);

  // TODO: we'll have result.json access in the next agent release, use that to verify what commands were run
});
