import { readFileSync, existsSync } from 'fs';
import { test, expect } from 'vitest';

/**
 * Login/whoami eval: we expect the agent to have run `vercel whoami` (or `vc whoami`)
 * and recorded the single-line output in whoami-output.txt. The CLI prints the
 * current user (username or context name); when stdout is not a TTY it's one line.
 */
test('whoami output was recorded', () => {
  expect(existsSync('whoami-output.txt')).toBe(true);

  const output = readFileSync('whoami-output.txt', 'utf-8').trim();
  expect(output.length).toBeGreaterThan(0);

  // Either plain username/context (one line) or JSON from whoami --format json
  const lines = output.split('\n').filter(Boolean);
  expect(lines.length).toBeGreaterThanOrEqual(1);
  const firstLine = lines[0];

  try {
    const parsed = JSON.parse(firstLine);
    // --format json: { username, email, name }
    expect(parsed).toHaveProperty('username');
    expect(typeof parsed.username).toBe('string');
    expect(parsed.username.length).toBeGreaterThan(0);
  } catch {
    // Plain whoami output: non-empty string (username or team/user context)
    expect(firstLine.length).toBeGreaterThan(0);
    expect(firstLine).not.toMatch(/^(Error|error:)/i);
  }
});
