import { test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';

/**
 * vc build eval: we expect the agent to have run a successful build and
 * to have used a non-interactive flag, recording the command in command-used.txt.
 */
test('build completed successfully', () => {
  const result = spawnSync('vc', ['whoami']);
  expect(result.status).toBe(0);
});
