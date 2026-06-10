import { test, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

function getShellCommands(): { command: string; success: boolean }[] {
  const results = JSON.parse(
    readFileSync('__agent_eval__/results.json', 'utf-8')
  );
  return results.o11y?.shellCommands ?? [];
}

test('agent used vercel integration categories subcommand', () => {
  const commands = getShellCommands();
  const categoriesCmd = commands.filter(c =>
    /\b(vercel|vc)\s+integration\s+categories\b/.test(c.command)
  );
  // Key signal: before this subcommand exists, this test fails. After it
  // ships, the agent has a direct way to enumerate the taxonomy.
  expect(categoriesCmd.length).toBeGreaterThan(0);
});

test('agent wrote categories file', () => {
  expect(existsSync('categories-found.txt')).toBe(true);
  const contents = readFileSync('categories-found.txt', 'utf-8').trim();
  expect(contents.length).toBeGreaterThan(0);
});

test('categories file includes at least 8 known category slugs', () => {
  if (!existsSync('categories-found.txt')) return;
  const contents = readFileSync('categories-found.txt', 'utf-8').toLowerCase();
  const knownSlugs = [
    'storage',
    'ai',
    'authentication',
    'monitoring',
    'observability',
    'commerce',
    'cms',
    'analytics',
    'payments',
    'logging',
    'workflow',
    'testing',
    'video',
    'flags',
    'experimentation',
    'searching',
    'security',
    'messaging',
    'productivity',
    'dev-tools',
  ];
  const mentioned = knownSlugs.filter(slug => contents.includes(slug));
  expect(mentioned.length).toBeGreaterThanOrEqual(8);
});

test('categories file uses slug format (not titles or tag IDs)', () => {
  if (!existsSync('categories-found.txt')) return;
  const contents = readFileSync('categories-found.txt', 'utf-8');

  // Tag IDs (legacy) should not appear in the file
  expect(contents).not.toMatch(/tag_[a-z_]+/);

  // Should not be all uppercase titles like "STORAGE" or "Storage"
  // (slugs are lowercase, may include hyphens)
  const lines = contents
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);
  const slugFormatted = lines.filter(l => /^[a-z][a-z0-9-]*$/.test(l));
  expect(slugFormatted.length).toBeGreaterThan(0);
});
