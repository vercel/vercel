import { test, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

function getShellCommands(): { command: string; success: boolean }[] {
  const results = JSON.parse(
    readFileSync('__agent_eval__/results.json', 'utf-8')
  );
  return results.o11y?.shellCommands ?? [];
}

test('agent invoked vercel integration discover', () => {
  const commands = getShellCommands();
  const discoverCalls = commands.filter(c =>
    /\b(vercel|vc)\s+integration\s+discover\b/.test(c.command)
  );
  expect(discoverCalls.length).toBeGreaterThan(0);
});

test('agent narrowed discovery (did not just dump everything)', () => {
  const commands = getShellCommands();

  const narrowedCalls = commands.filter(c => {
    const cmd = c.command;
    return (
      /\b(vercel|vc)\s+integration\s+discover\b/.test(cmd) &&
      // narrowed if it has --category/--c OR a positional argument
      (/--category|--?c\b/.test(cmd) ||
        /\bdiscover\s+\S+/.test(cmd.replace(/--\S+/g, '')))
    );
  });

  expect(narrowedCalls.length).toBeGreaterThan(0);
});

test('agent mapped vague intent to monitoring/observability category', () => {
  const commands = getShellCommands();
  const categoryUsage = commands.filter(c =>
    /\b(vercel|vc)\s+integration\s+discover\b.*(--category[=\s]+(monitoring|observability)|--?c\s+(monitoring|observability))/.test(
      c.command
    )
  );
  // Key signal: agent maps natural language ("track errors") to canonical
  // category slug ("monitoring" or "observability"). Without --category in
  // CLI + skill teaching the mapping, this fails. After, it passes.
  expect(categoryUsage.length).toBeGreaterThan(0);
});

test('agent wrote a recommendation file', () => {
  expect(existsSync('recommendation.txt')).toBe(true);
  const rec = readFileSync('recommendation.txt', 'utf-8').trim();
  expect(rec.length).toBeGreaterThan(0);
});

test('recommendation names a real monitoring/observability integration', () => {
  if (!existsSync('recommendation.txt')) return;
  const rec = readFileSync('recommendation.txt', 'utf-8').toLowerCase();
  const knownNames = [
    'sentry',
    'checkly',
    'rollbar',
    'dash0',
    'kubiks',
    'datadog',
  ];
  const mentioned = knownNames.filter(name => rec.includes(name));
  expect(mentioned.length).toBeGreaterThan(0);
});
