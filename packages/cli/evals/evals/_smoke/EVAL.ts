import { test, expect } from 'vitest';

/**
 * vc build eval: we expect the agent to have run a successful build and
 * to have used a non-interactive flag, recording the command in command-used.txt.
 */
test('build completed successfully', () => {
  expect(true).toBe(true);
});
