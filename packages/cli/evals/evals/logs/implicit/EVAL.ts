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

test('agent used vercel logs with a bounded mode', () => {
  const commands = getShellCommands();
  const logsCommands = commands.filter(command =>
    /\b(vercel|vc)\s+logs\b/.test(command)
  );

  expect(logsCommands.length).toBeGreaterThan(0);
  expect(
    logsCommands.some(
      command =>
        command.includes('--no-follow') ||
        command.includes('--limit') ||
        /\s-n\s+\d+/.test(command) ||
        command.includes('--since') ||
        command.includes('--json')
    )
  ).toBe(true);
});

test('agent created a deployment before fetching logs', () => {
  const commands = getShellCommands();
  expect(
    commands.some(command => /\b(vercel|vc)\s+deploy\b/.test(command))
  ).toBe(true);
});

test('agent saved request activity and wrote an answer', () => {
  expect(existsSync('logs-deployment-url.txt')).toBe(true);
  expect(existsSync('logs-output.txt')).toBe(true);
  expect(existsSync('logs-answer.txt')).toBe(true);

  const deployment = readFileSync('logs-deployment-url.txt', 'utf-8').trim();
  const logs = readFileSync('logs-output.txt', 'utf-8');
  const answer = readFileSync('logs-answer.txt', 'utf-8');

  expect(deployment.length).toBeGreaterThan(0);
  expect(logs.trim().length).toBeGreaterThan(0);
  expect(/log|request|activity|traffic|deployment|recent/i.test(answer)).toBe(
    true
  );
});
