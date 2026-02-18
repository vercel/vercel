import { readFileSync, existsSync } from 'fs';
import { test, expect } from 'vitest';

/**
 * vc build eval: we expect the agent to have run a successful build and
 * recorded the build command in command-used.txt. We do not require --yes
 * so the prompt can stay goal-only.
 */
test('build completed successfully', () => {
  const outputDir = '.vercel/output';
  expect(existsSync(outputDir)).toBe(true);
  expect(
    existsSync(`${outputDir}/config.json`) ||
      existsSync(`${outputDir}/builds.json`)
  ).toBe(true);
});

test('agent recorded the build command', () => {
  expect(existsSync('command-used.txt')).toBe(true);

  const command = readFileSync('command-used.txt', 'utf-8').trim();
  expect(command.length).toBeGreaterThan(0);
  expect(command).toMatch(/\b(vercel|vc)\s+build\b/);
});
