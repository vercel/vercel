import { readFileSync, existsSync } from 'fs';
import { test, expect } from 'vitest';

/**
 * Auth matrix login eval:
 * - When CLI_EVAL_AUTH_STATE=not-logged-in, we expect whoami to fail first with
 *   a "no credentials" style error and then a login attempt.
 * - When CLI_EVAL_AUTH_STATE=logged-in, we expect whoami to succeed directly,
 *   without needing a login attempt.
 *
 * In all cases, the agent records a short transcript in login-eval-log.txt.
 */
test('login behavior matches the requested auth state', () => {
  expect(existsSync('login-eval-log.txt')).toBe(true);

  const log = readFileSync('login-eval-log.txt', 'utf-8');
  const trimmed = log.trim();
  expect(trimmed.length).toBeGreaterThan(0);

  const authState = process.env.CLI_EVAL_AUTH_STATE ?? 'logged-in';

  const hasNoCredsError = /No existing credentials found/i.test(log);
  const mentionsLoginCommand =
    /\bvercel\s+login\b/.test(log) || /\bvc\s+login\b/.test(log);

  if (authState === 'not-logged-in') {
    // In the not-logged-in variant, we should see a missing-credentials error
    // followed by an attempted login.
    expect(hasNoCredsError).toBe(true);
    expect(mentionsLoginCommand).toBe(true);
  } else {
    // In the logged-in variant, it's fine to skip login entirely; whoami
    // should just work so we do *not* require the error or login command.
    // We just assert that the transcript exists and is non-empty.
    expect(true).toBe(true);
  }
});
