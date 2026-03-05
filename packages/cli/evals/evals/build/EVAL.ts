import { readFileSync, existsSync } from 'fs';
import { test, expect } from 'vitest';

function getShellCommands(): string[] {
  const results = JSON.parse(
    readFileSync('__agent_eval__/results.json', 'utf-8')
  ) as {
    o11y?: { shellCommands?: Array<{ command: string }> };
  };

  return (results.o11y?.shellCommands ?? []).map(c => c.command);
}

/**
 * vc build eval: we expect the agent to have run a successful build and
 * to have used a non-interactive flag, as observed from the recorded shell commands.
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
  const commands = getShellCommands();
  expect(commands.length).toBeGreaterThan(0);

  const buildCommands = commands.filter(command =>
    /\b(vercel|vc)\s+build\b/.test(command)
  );
  expect(buildCommands.length).toBeGreaterThan(0);

  const hasNonInteractive = buildCommands.some(command => {
    return (
      command.includes('--yes') ||
      /\s-y(\s|$)/.test(command) ||
      command.endsWith('-y') ||
      command.includes('--non-interactive')
    );
  });
  expect(hasNonInteractive).toBe(true);
});
