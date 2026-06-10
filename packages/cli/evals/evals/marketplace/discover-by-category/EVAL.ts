import { test, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

function getShellCommands(): { command: string; success: boolean }[] {
  const results = JSON.parse(
    readFileSync('__agent_eval__/results.json', 'utf-8')
  );
  return results.o11y?.shellCommands ?? [];
}

test('agent used vercel integration discover', () => {
  const commands = getShellCommands();
  const discoverCommands = commands.filter(c =>
    /\b(vercel|vc)\s+integration\s+discover\b/.test(c.command)
  );
  expect(discoverCommands.length).toBeGreaterThan(0);
});

test('agent narrowed discovery (did not dump full marketplace)', () => {
  const commands = getShellCommands();

  // Preferred: --category flag (new behavior)
  const categoryFlag = commands.filter(c =>
    /\b(vercel|vc)\s+integration\s+discover\b.*(--category[=\s]+\S+|--?c\s+\S+)/.test(
      c.command
    )
  );

  // Acceptable fallback: positional substring filter with relevant term
  const substringFilter = commands.filter(c =>
    /\b(vercel|vc)\s+integration\s+discover\s+(monitoring|observability|error|tracking|logs|sentry|rollbar|datadog)\b/i.test(
      c.command
    )
  );

  expect(categoryFlag.length + substringFilter.length).toBeGreaterThan(0);
});

test('agent used --category flag (preferred new behavior)', () => {
  const commands = getShellCommands();
  const categoryFlag = commands.filter(c =>
    /\b(vercel|vc)\s+integration\s+discover\b.*(--category[=\s]+monitoring|--?c\s+monitoring)/.test(
      c.command
    )
  );
  // Key signal for before/after comparison: without --category flag in CLI or
  // skill teaching it, this test fails. After the flag ships and skill is
  // updated, this test passes.
  expect(categoryFlag.length).toBeGreaterThan(0);
});

test('agent wrote discovery findings to file', () => {
  expect(existsSync('discovery-result.txt')).toBe(true);
  const findings = readFileSync('discovery-result.txt', 'utf-8').trim();
  expect(findings.length).toBeGreaterThan(0);
});

test('findings include at least 2 monitoring integrations from the Marketplace', () => {
  if (!existsSync('discovery-result.txt')) return;
  const findings = readFileSync('discovery-result.txt', 'utf-8').toLowerCase();
  const knownMonitoring = [
    'sentry',
    'checkly',
    'rollbar',
    'dash0',
    'kubiks',
    'datadog',
  ];
  const mentioned = knownMonitoring.filter(name => findings.includes(name));
  expect(mentioned.length).toBeGreaterThanOrEqual(2);
});
