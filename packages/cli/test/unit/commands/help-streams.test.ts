import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../mocks/client';
import { printCommandHelp } from '../../../src/commands/print-command-help';
import budget from '../../../src/commands/budget';
import { configureHelpOutput } from '../../../src/util/output/help-theme';

beforeEach(() => {
  client.reset();
  vi.stubEnv('TERM', 'xterm-256color');
  vi.stubEnv('NO_COLOR', '');
  vi.stubEnv('FORCE_COLOR', '1');
});
afterEach(() => {
  vi.unstubAllEnvs();
  configureHelpOutput(false);
});

describe('help destination streams', () => {
  it.each([
    [true, false],
    [false, true],
  ])('styles stdout help for its own TTY=%s, stderr=%s', (stdout, stderr) => {
    client.stdout.isTTY = stdout;
    client.stderr.isTTY = stderr;
    expect(printCommandHelp(client, 'env', ['add'])).toBe(0);
    const text = client.stdout.getFullOutput();
    expect(text.includes('\u001b[1m')).toBe(stdout);
    expect(client.stderr.getFullOutput()).toBe('');
  });
  it.each([
    [true, false],
    [false, true],
  ])('styles fallback stderr help with stdout=%s, stderr=%s', async (stdout, stderr) => {
    client.stdout.isTTY = stdout;
    client.stderr.isTTY = stderr;
    client.setArgv('budget', 'unknown-subcommand');
    expect(await budget(client)).toBe(2);
    const text = client.stderr.getFullOutput();
    expect(text).toContain('▲');
    expect(text.includes('\u001b[1m')).toBe(stderr);
    expect(client.stdout.getFullOutput()).toBe('');
  });
  it('applies the parsed no-color preference before stdout help dispatch', () => {
    configureHelpOutput(true);
    expect(printCommandHelp(client, 'env', ['add'])).toBe(0);
    expect(client.stdout.getFullOutput()).not.toContain('\u001b');
  });
});
