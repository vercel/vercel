import { existsSync, readFileSync } from 'fs';
import { test, expect } from 'vitest';

function getShellCommands(): string[] {
  const results = JSON.parse(
    readFileSync('__agent_eval__/results.json', 'utf-8')
  ) as {
    o11y?: { shellCommands?: Array<{ command: string }> };
  };

  return (results.o11y?.shellCommands ?? []).map(c => c.command);
}

test('build completed successfully', () => {
  expect(existsSync('project/package.json')).toBe(true);
  expect(existsSync('project/next.config.ts')).toBe(true);
});

test('agent used vercel init', () => {
  const commands = getShellCommands();
  const initCommands = commands.filter(command =>
    /\b(vercel|vc)\s+init\b/.test(command)
  );

  expect(initCommands.length).toBeGreaterThan(0);
  expect(initCommands.some(command => /\bproject\b/.test(command))).toBe(true);
});

test('initialized project is a Next.js project and summary was written', () => {
  const pkg = JSON.parse(readFileSync('project/package.json', 'utf-8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  expect({ ...pkg.dependencies, ...pkg.devDependencies }).toHaveProperty(
    'next'
  );
  expect(existsSync('init-summary.txt')).toBe(true);

  const summary = readFileSync('init-summary.txt', 'utf-8');
  expect(summary.trim().length).toBeGreaterThan(0);
});
