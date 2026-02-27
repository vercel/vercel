import { readFileSync, existsSync } from 'fs';
import { test, expect } from 'vitest';

/**
 * Not-logged-in login eval: we expect the agent to have exercised the CLI
 * behavior when no credentials are present (whoami fails) and then attempted
 * to log in using `vercel login` (or `vc login`), recording the flow in
 * login-eval-log.txt.
 */
test('login flow from a logged-out state was exercised', () => {
  expect(existsSync('login-eval-log.txt')).toBe(true);

  const log = readFileSync('login-eval-log.txt', 'utf-8');
  const trimmed = log.trim();
  expect(trimmed.length).toBeGreaterThan(0);

  // The agent should have captured the "no credentials" error from a whoami call
  const hasNoCredsError = /No existing credentials found/i.test(log);
  expect(hasNoCredsError).toBe(true);

  // And it should clearly show that `vercel login` (or `vc login`) was run
  const mentionsLoginCommand =
    /\bvercel\s+login\b/.test(log) || /\bvc\s+login\b/.test(log);
  expect(mentionsLoginCommand).toBe(true);
});
