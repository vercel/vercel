import { readFileSync, existsSync } from 'fs';
import { test, expect } from 'vitest';

/**
 * vc build eval: we expect the agent to have run a successful build and
 * to have used a non-interactive flag, recording the command in command-used.txt.
 */
test('build completed successfully', () => {
  const outputDir = '.vercel/output';
  expect(existsSync(outputDir)).toBe(true);
  expect(
    existsSync(`${outputDir}/config.json`) ||
      existsSync(`${outputDir}/builds.json`)
  ).toBe(true);
});

test('agent used a non-interactive build command', () => {
  expect(existsSync('command-used.txt')).toBe(true);

  const command = readFileSync('command-used.txt', 'utf-8').trim();
  expect(command.length).toBeGreaterThan(0);
  expect(command).toMatch(/\b(vercel|vc)\s+build\b/);

  const hasNonInteractive =
    command.includes('--yes') ||
    /\s-y(\s|$)/.test(command) ||
    command.endsWith('-y');
  expect(hasNonInteractive).toBe(true);
});
