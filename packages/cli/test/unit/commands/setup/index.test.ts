import { beforeEach, describe, expect, it, vi } from 'vitest';
import stripAnsi from 'strip-ansi';
import { client } from '../../../mocks/client';
import type { PluginSetupResult } from '../../../../src/util/agent/auto-install-agentic';

const mocks = vi.hoisted(() => ({
  setupVercelPlugin: vi.fn(),
  setupCodexPlugin: vi.fn(),
  setupOpenCodePlugin: vi.fn(),
  setupCodingAgents: vi.fn(),
}));

vi.mock('../../../../src/util/agent/auto-install-agentic', () => ({
  setupVercelPlugin: mocks.setupVercelPlugin,
}));

vi.mock('../../../../src/commands/ai-gateway/coding-agents-setup', () => ({
  setupCodingAgents: mocks.setupCodingAgents,
}));

vi.mock('../../../../src/util/agent/setup-codex-plugin', () => ({
  setupCodexPlugin: mocks.setupCodexPlugin,
}));

vi.mock('../../../../src/util/agent/setup-opencode-plugin', () => ({
  setupOpenCodePlugin: mocks.setupOpenCodePlugin,
}));

import setup from '../../../../src/commands/setup';

function pluginResult(
  status: PluginSetupResult['status'],
  message = `plugin:${status}`
): PluginSetupResult {
  return { status, message };
}

describe('setup', () => {
  beforeEach(() => {
    client.reset();
    mocks.setupVercelPlugin.mockReset();
    mocks.setupCodexPlugin.mockReset();
    mocks.setupOpenCodePlugin.mockReset();
    mocks.setupCodingAgents.mockReset();
    mocks.setupVercelPlugin.mockResolvedValue(pluginResult('installed'));
    mocks.setupCodexPlugin.mockResolvedValue(pluginResult('not_detected'));
    mocks.setupOpenCodePlugin.mockResolvedValue(pluginResult('not_detected'));
    mocks.setupCodingAgents.mockResolvedValue({
      exitCode: 0,
      outcome: 'configured',
    });
  });

  describe('--help', () => {
    it('prints help, exits 2, and tracks telemetry', async () => {
      client.setArgv('setup', '--help');
      const exitCode = await setup(client);
      expect(exitCode).toBe(0);
      const out = client.stderr.getFullOutput();
      expect(out).toContain('plugin');
      expect(out).toContain('gateway');
      expect(out).toContain('skills');
      // Deprecated step flags stay accepted but leave the help.
      expect(out).not.toContain('--plugin');
      expect(out).not.toContain('--gateway');
      expect(out).toContain('--dry-run');
      expect(out).toContain('--agent');
      expect(out).toContain('Codex');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:help', value: 'setup' },
      ]);
      expect(mocks.setupVercelPlugin).not.toHaveBeenCalled();
      expect(mocks.setupCodingAgents).not.toHaveBeenCalled();
    });
  });

  it('rejects unknown flags', async () => {
    client.setArgv('setup', '--bogus');
    const exitCode = await setup(client);
    expect(exitCode).toBe(2);
    expect(mocks.setupVercelPlugin).not.toHaveBeenCalled();
    expect(mocks.setupCodingAgents).not.toHaveBeenCalled();
  });

  it('reports invalid flags as JSON in non-interactive mode', async () => {
    client.setArgv('setup', '--bogus', '--non-interactive');
    expect(await setup(client)).toBe(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
    });
    expect(mocks.setupVercelPlugin).not.toHaveBeenCalled();
    expect(mocks.setupCodingAgents).not.toHaveBeenCalled();
  });

  it.each([
    false,
    true,
  ])('rejects positional arguments before any setup work (machine: %s)', async machine => {
    client.setArgv('setup', 'bogus', ...(machine ? ['--non-interactive'] : []));
    expect(await setup(client)).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Use vercel setup plugin, gateway, or skills'
    );
    expect(mocks.setupVercelPlugin).not.toHaveBeenCalled();
    expect(mocks.setupCodingAgents).not.toHaveBeenCalled();
    if (machine) {
      expect(JSON.parse(client.stdout.getFullOutput()).reason).toBe(
        'invalid_arguments'
      );
    }
  });

  it.each([
    'plugin',
    'gateway',
  ])('reports unexpected %s failures as JSON', async step => {
    const action =
      step === 'plugin' ? mocks.setupVercelPlugin : mocks.setupCodingAgents;
    action.mockRejectedValue(new Error('Setup dependency failed'));
    client.setArgv('setup', `--${step}`, '--yes', '--non-interactive');
    expect(await setup(client)).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      status: 'error',
      reason: 'setup_failed',
      message: 'Failed to complete setup.',
    });
    expect(client.stderr.getFullOutput()).not.toContain('Setup complete');
  });

  it('runs the plugin step then the gateway step and prints a receipt', async () => {
    client.setArgv('setup');
    const exitCode = await setup(client);
    expect(exitCode).toBe(0);

    expect(mocks.setupVercelPlugin).toHaveBeenCalledTimes(1);
    expect(mocks.setupVercelPlugin.mock.calls[0][1]).toMatchObject({
      yes: false,
      dryRun: false,
      canPrompt: true,
    });
    expect(mocks.setupCodingAgents).toHaveBeenCalledTimes(1);
    expect(mocks.setupCodingAgents.mock.calls[0][1]).toEqual([]);
    expect(mocks.setupVercelPlugin.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setupCodingAgents.mock.invocationCallOrder[0]
    );

    const out = stripAnsi(client.stderr.getFullOutput());
    expect(out).toContain('  Vercel plugin\n');
    expect(out).toContain('plugin:installed\n');
    expect(out).toContain('  AI Gateway\n');
    expect(out).toMatch(/^✓ Setup complete$/m);
    expect(out).toContain('Vercel plugin   Installed for Claude Code');
    expect(out).toContain('AI Gateway      Completed (see above)');
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('passes --yes and --dry-run through to the gateway step', async () => {
    mocks.setupVercelPlugin.mockResolvedValue(pluginResult('dry_run'));
    mocks.setupCodingAgents.mockResolvedValue({
      exitCode: 0,
      outcome: 'dry_run',
    });
    client.setArgv('setup', '--yes', '--dry-run');
    const exitCode = await setup(client);
    expect(exitCode).toBe(0);

    expect(mocks.setupVercelPlugin.mock.calls[0][1]).toMatchObject({
      yes: true,
      dryRun: true,
    });
    expect(mocks.setupCodingAgents.mock.calls[0][1]).toEqual([
      '--yes',
      '--dry-run',
    ]);
    const out = stripAnsi(client.stderr.getFullOutput());
    expect(out).toMatch(/^✓ Dry run complete$/m);
    expect(out).toContain('Would install for Claude Code');
    expect(out).toContain('AI Gateway      Previewed (see above)');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:dry-run', value: 'TRUE' },
      { key: 'flag:yes', value: 'TRUE' },
    ]);
  });

  it('words a dry-run receipt as an update when the plugin is outdated', async () => {
    mocks.setupVercelPlugin.mockResolvedValue({
      ...pluginResult('dry_run'),
      action: 'update',
    });
    client.setArgv('setup', '--plugin', '--dry-run');
    await setup(client);
    const out = stripAnsi(client.stderr.getFullOutput());
    expect(out).toContain('Would update for Claude Code');
    expect(out).not.toContain('Would install');
  });

  it('--plugin only runs the plugin step', async () => {
    client.setArgv('setup', '--plugin');
    const exitCode = await setup(client);
    expect(exitCode).toBe(0);
    expect(mocks.setupVercelPlugin).toHaveBeenCalledTimes(1);
    expect(mocks.setupCodingAgents).not.toHaveBeenCalled();
    const out = stripAnsi(client.stderr.getFullOutput());
    expect(out).not.toContain('AI Gateway');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:plugin', value: 'TRUE' },
    ]);
  });

  it('--gateway only runs the gateway step', async () => {
    client.setArgv('setup', '--gateway');
    const exitCode = await setup(client);
    expect(exitCode).toBe(0);
    expect(mocks.setupVercelPlugin).not.toHaveBeenCalled();
    expect(mocks.setupCodingAgents).toHaveBeenCalledTimes(1);
    const out = stripAnsi(client.stderr.getFullOutput());
    expect(out).not.toContain('Vercel plugin');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:gateway', value: 'TRUE' },
    ]);
  });

  it('`setup plugin` only runs the plugin step', async () => {
    client.setArgv('setup', 'plugin');
    expect(await setup(client)).toBe(0);
    expect(mocks.setupVercelPlugin).toHaveBeenCalledTimes(1);
    expect(mocks.setupCodingAgents).not.toHaveBeenCalled();
    const out = stripAnsi(client.stderr.getFullOutput());
    expect(out).not.toContain('AI Gateway');
    expect(out).not.toContain('deprecated');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:plugin', value: 'plugin' },
    ]);
  });

  it('`setup gateway` only runs the gateway step', async () => {
    client.setArgv('setup', 'gateway', '--agent', 'claude-code');
    expect(await setup(client)).toBe(0);
    expect(mocks.setupVercelPlugin).not.toHaveBeenCalled();
    expect(mocks.setupCodingAgents).toHaveBeenCalledTimes(1);
    expect(stripAnsi(client.stderr.getFullOutput())).not.toContain(
      'Vercel plugin'
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:gateway', value: 'gateway' },
      { key: 'option:agent', value: 'claude-code' },
    ]);
  });

  it.each([
    ['--plugin', 'plugin'],
    ['--gateway', 'gateway'],
  ])('warns that %s is deprecated', async (flag, step) => {
    client.setArgv('setup', flag);
    expect(await setup(client)).toBe(0);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      `\`vercel setup ${flag}\` is deprecated. Use \`vercel setup ${step}\`.`
    );
  });

  it('forwards the AI Gateway options from `setup gateway`', async () => {
    client.setArgv(
      'setup',
      'gateway',
      '--all',
      '--key',
      'secret-key',
      '--reconfigure',
      '--no-session-migration'
    );
    expect(await setup(client)).toBe(0);
    expect(mocks.setupCodingAgents.mock.calls[0][1]).toEqual([
      '--all',
      '--key',
      'secret-key',
      '--reconfigure',
      '--no-session-migration',
    ]);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:gateway', value: 'gateway' },
      { key: 'flag:all', value: 'TRUE' },
      { key: 'option:key', value: '[REDACTED]' },
      { key: 'flag:reconfigure', value: 'TRUE' },
      { key: 'flag:no-session-migration', value: 'TRUE' },
    ]);
  });

  it('keeps the AI Gateway options off bare `setup`', async () => {
    client.setArgv('setup', '--reconfigure');
    expect(await setup(client)).toBe(2);
    expect(mocks.setupCodingAgents).not.toHaveBeenCalled();
  });

  it('prints help for a step subcommand without running it', async () => {
    client.setArgv('setup', 'gateway', '--help');
    expect(await setup(client)).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('vercel setup gateway');
    expect(mocks.setupCodingAgents).not.toHaveBeenCalled();
  });

  it('rejects the deprecated step flags on a step subcommand', async () => {
    client.setArgv('setup', 'plugin', '--gateway');
    expect(await setup(client)).toBe(2);
    expect(mocks.setupVercelPlugin).not.toHaveBeenCalled();
    expect(mocks.setupCodingAgents).not.toHaveBeenCalled();
  });

  it('--plugin --gateway runs both steps', async () => {
    client.setArgv('setup', '--plugin', '--gateway');
    await setup(client);
    expect(mocks.setupVercelPlugin).toHaveBeenCalledTimes(1);
    expect(mocks.setupCodingAgents).toHaveBeenCalledTimes(1);
  });

  it('keeps going after a skipped plugin step and reports it in the receipt', async () => {
    mocks.setupVercelPlugin.mockResolvedValue(pluginResult('not_detected'));
    client.setArgv('setup');
    const exitCode = await setup(client);
    expect(exitCode).toBe(0);
    expect(mocks.setupCodingAgents).toHaveBeenCalledTimes(1);
    const out = stripAnsi(client.stderr.getFullOutput());
    expect(out).toContain('Skipped (Claude Code not detected)');
    expect(out).toMatch(/^✓ Setup complete$/m);
  });

  it('exits 1 when the gateway step fails', async () => {
    mocks.setupCodingAgents.mockResolvedValue({
      exitCode: 1,
      outcome: 'failed',
    });
    client.setArgv('setup');
    const exitCode = await setup(client);
    expect(exitCode).toBe(1);
    const out = stripAnsi(client.stderr.getFullOutput());
    expect(out).toMatch(/^✗ Setup incomplete$/m);
    expect(out).toContain('AI Gateway      Failed');
    expect(out).not.toContain('Setup complete');
  });

  it('exits 1 when the plugin step fails', async () => {
    mocks.setupVercelPlugin.mockResolvedValue(pluginResult('failed'));
    client.setArgv('setup');
    const exitCode = await setup(client);
    expect(exitCode).toBe(1);
    // The gateway step still runs so one failure doesn't block the other.
    expect(mocks.setupCodingAgents).toHaveBeenCalledTimes(1);
    const out = stripAnsi(client.stderr.getFullOutput());
    expect(out).toContain('Vercel plugin   Failed');
  });

  it('does not prompt when stdin is not a TTY', async () => {
    client.stdin.isTTY = false;
    client.setArgv('setup');
    await setup(client);
    expect(mocks.setupVercelPlugin.mock.calls[0][1]).toMatchObject({
      canPrompt: false,
    });
  });

  it('reports missing confirmation as one actionable JSON result before gateway setup', async () => {
    mocks.setupVercelPlugin.mockResolvedValue(
      pluginResult('confirmation_required')
    );
    client.setArgv(
      'setup',
      '--non-interactive',
      '--scope',
      'my-team',
      '--token',
      'secret'
    );
    const exitCode = await setup(client);
    expect(exitCode).toBe(1);
    expect(mocks.setupVercelPlugin.mock.calls[0][1]).toMatchObject({
      canPrompt: false,
    });
    expect(mocks.setupCodingAgents).not.toHaveBeenCalled();
    const out = JSON.parse(client.stdout.getFullOutput());
    expect(out).toMatchObject({
      status: 'action_required',
      reason: 'confirmation_required',
      next: [{ command: expect.stringContaining('setup --yes') }],
    });
    expect(out.next[0].command).toContain('--scope my-team');
    expect(out.next[0].command).toContain('--non-interactive');
    expect(client.stdout.getFullOutput()).not.toContain('secret');
    expect(client.stderr.getFullOutput()).toContain('Setup incomplete');
    expect(client.stderr.getFullOutput()).not.toContain('Setup complete');
  });

  it('requires confirmation in non-TTY plugin-only setup', async () => {
    mocks.setupVercelPlugin.mockResolvedValue(
      pluginResult('confirmation_required')
    );
    client.stdin.isTTY = false;
    client.setArgv('setup', '--plugin');
    expect(await setup(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Confirmation required');
    expect(client.stderr.getFullOutput()).not.toContain('Setup complete');
  });

  it('keeps a plugin-only confirmation retry limited to the plugin', async () => {
    mocks.setupVercelPlugin.mockResolvedValue(
      pluginResult('confirmation_required')
    );
    client.setArgv('setup', '--plugin', '--non-interactive');
    expect(await setup(client)).toBe(1);
    const out = JSON.parse(client.stdout.getFullOutput());
    expect(out.next[0].command).toContain('setup plugin --yes');
  });

  it.each([
    ['installed', 'ok', 0],
    ['up_to_date', 'ok', 0],
    ['dry_run', 'ok', 0],
    ['failed', 'error', 1],
  ] as const)('emits JSON for plugin-only %s results', async (status, expectedStatus, exitCode) => {
    mocks.setupVercelPlugin.mockResolvedValue(pluginResult(status));
    client.setArgv('setup', '--plugin', '--non-interactive', '--yes');
    expect(await setup(client)).toBe(exitCode);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: expectedStatus,
      reason: `plugin_${status}`,
      message: `plugin:${status}`,
    });
    expect(mocks.setupCodingAgents).not.toHaveBeenCalled();
  });

  it('stops after a plugin failure without emitting a successful gateway payload', async () => {
    mocks.setupVercelPlugin.mockResolvedValue(pluginResult('failed'));
    client.setArgv('setup', '--yes', '--non-interactive');
    expect(await setup(client)).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput()).status).toBe('error');
    expect(mocks.setupCodingAgents).not.toHaveBeenCalled();
  });

  it('leaves gateway JSON as the only machine result when both steps succeed', async () => {
    const payload = { status: 'ok', reason: 'coding_agents_configured' };
    mocks.setupCodingAgents.mockImplementation(async () => {
      client.stdout.write(JSON.stringify(payload));
      return { exitCode: 0, outcome: 'configured' };
    });
    client.setArgv('setup', '--yes', '--non-interactive');
    expect(await setup(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual(payload);
  });

  it.each([
    ['canceled', 'Canceled (no changes applied)'],
    ['skipped', 'Skipped (see above)'],
    ['agent_prompt', 'Prompt generated (apply it with your agent)'],
  ])('does not claim completion for a %s gateway outcome', async (outcome, summary) => {
    mocks.setupCodingAgents.mockResolvedValue({ exitCode: 0, outcome });
    client.setArgv('setup', '--gateway');
    expect(await setup(client)).toBe(0);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('Setup incomplete');
    expect(out).toContain(summary);
    expect(out).not.toContain('Setup complete');
    expect(out).not.toContain('✓');
  });

  it('sets up both detected plugin targets and reports each result in one JSON object', async () => {
    mocks.setupCodexPlugin.mockResolvedValue(
      pluginResult('installed', 'Installed for Codex')
    );
    client.setArgv('setup', '--plugin', '--yes', '--non-interactive');
    expect(await setup(client)).toBe(0);
    expect(mocks.setupVercelPlugin).toHaveBeenCalledTimes(1);
    expect(mocks.setupCodexPlugin).toHaveBeenCalledTimes(1);
    const out = JSON.parse(client.stdout.getFullOutput());
    expect(out.status).toBe('ok');
    expect(out.plugins).toEqual([
      expect.objectContaining({ agent: 'claude-code', status: 'installed' }),
      expect.objectContaining({ agent: 'codex', status: 'installed' }),
      expect.objectContaining({ agent: 'opencode', status: 'not_detected' }),
    ]);
    expect(client.stderr.getFullOutput()).toContain(
      'Installed for Claude Code; Installed for Codex'
    );
  });

  it('can install only the Codex plugin', async () => {
    mocks.setupCodexPlugin.mockResolvedValue(
      pluginResult('installed', 'Installed for Codex')
    );
    client.setArgv('setup', '--plugin', '--agent', 'codex', '--yes');
    expect(await setup(client)).toBe(0);
    expect(mocks.setupVercelPlugin).not.toHaveBeenCalled();
    expect(mocks.setupCodingAgents).not.toHaveBeenCalled();
    expect(mocks.setupCodexPlugin.mock.calls[0][1]).toMatchObject({
      yes: true,
    });
    expect(client.stderr.getFullOutput()).toContain('Installed for Codex');
    expect(client.stderr.getFullOutput()).not.toContain('Claude Code');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'option:agent', value: 'codex' },
      { key: 'flag:plugin', value: 'TRUE' },
      { key: 'flag:yes', value: 'TRUE' },
    ]);
  });

  it('can install only the OpenCode plugin', async () => {
    mocks.setupOpenCodePlugin.mockResolvedValue(
      pluginResult('installed', 'Installed for OpenCode')
    );
    client.setArgv('setup', '--plugin', '--agent', 'opencode', '--yes');
    expect(await setup(client)).toBe(0);
    expect(mocks.setupVercelPlugin).not.toHaveBeenCalled();
    expect(mocks.setupCodexPlugin).not.toHaveBeenCalled();
    expect(mocks.setupCodingAgents).not.toHaveBeenCalled();
    expect(mocks.setupOpenCodePlugin.mock.calls[0][1]).toMatchObject({
      yes: true,
    });
    expect(client.stderr.getFullOutput()).toContain('Installed for OpenCode');
  });

  it.each([
    [
      'unsupported',
      'Skipped (OpenCode needs an upgrade)',
      /^✓ Setup complete$/m,
    ],
    ['disabled', 'Disabled in OpenCode config', /^ {2}Setup incomplete$/m],
  ] as const)('shows an OpenCode %s result next to an installed Claude plugin', async (status, summary, heading) => {
    mocks.setupOpenCodePlugin.mockResolvedValue(pluginResult(status));
    client.setArgv('setup', '--plugin');
    expect(await setup(client)).toBe(0);
    const out = stripAnsi(client.stderr.getFullOutput());
    expect(out).toContain(`plugin:${status}\n`);
    expect(out).toContain(`Installed for Claude Code; ${summary}`);
    expect(out).toMatch(heading);
  });

  it('keeps a Codex confirmation retry limited to the requested agent and step', async () => {
    mocks.setupCodexPlugin.mockResolvedValue(
      pluginResult('confirmation_required')
    );
    client.setArgv(
      'setup',
      '--plugin',
      '--agent',
      'codex',
      '--non-interactive',
      '--scope',
      'my-team',
      '--token',
      'secret'
    );
    expect(await setup(client)).toBe(1);
    const out = JSON.parse(client.stdout.getFullOutput());
    expect(out.status).toBe('action_required');
    expect(out.next[0].command).toContain('setup plugin --agent codex --yes');
    expect(out.next[0].command).toContain('--scope my-team');
    expect(out.next[0].command).not.toContain('secret');
    expect(mocks.setupCodingAgents).not.toHaveBeenCalled();
  });

  it.each([
    'failed',
    'confirmation_required',
  ] as const)('does not hide a Codex %s behind a current Claude plugin', async status => {
    mocks.setupVercelPlugin.mockResolvedValue(pluginResult('up_to_date'));
    mocks.setupCodexPlugin.mockResolvedValue(pluginResult(status));
    client.setArgv('setup', '--non-interactive');
    expect(await setup(client)).toBe(1);
    const out = JSON.parse(client.stdout.getFullOutput());
    expect(out.status).toBe(status === 'failed' ? 'error' : 'action_required');
    expect(out.plugins).toContainEqual(
      expect.objectContaining({ agent: 'codex', status })
    );
    expect(mocks.setupCodingAgents).not.toHaveBeenCalled();
    expect(client.stderr.getFullOutput()).not.toContain('Setup complete');
  });

  it('marks setup incomplete when the Codex plugin is declined', async () => {
    mocks.setupCodexPlugin.mockResolvedValue(pluginResult('declined'));
    client.setArgv('setup', '--plugin');
    expect(await setup(client)).toBe(0);
    expect(client.stderr.getFullOutput()).toContain('Skipped for Codex');
    expect(client.stderr.getFullOutput()).toContain('Setup incomplete');
    expect(client.stderr.getFullOutput()).not.toContain('Setup complete');
  });

  it('forwards the normalized, deduplicated agent selection to both steps', async () => {
    client.setArgv(
      'setup',
      '--agent',
      'CODEX',
      '--agent',
      'codex',
      '--yes',
      '--dry-run'
    );
    expect(await setup(client)).toBe(0);
    expect(mocks.setupVercelPlugin).not.toHaveBeenCalled();
    expect(mocks.setupCodexPlugin).toHaveBeenCalledTimes(1);
    expect(mocks.setupCodingAgents.mock.calls[0][1]).toEqual([
      '--yes',
      '--dry-run',
      '--agent',
      'codex',
    ]);
  });

  it('allows a Gateway-only agent without attempting a plugin install for it', async () => {
    client.setArgv('setup', '--agent', 'zcode', '--yes');
    expect(await setup(client)).toBe(0);
    expect(mocks.setupVercelPlugin).not.toHaveBeenCalled();
    expect(mocks.setupCodexPlugin).not.toHaveBeenCalled();
    expect(mocks.setupCodingAgents.mock.calls[0][1]).toEqual([
      '--yes',
      '--agent',
      'zcode',
    ]);
  });

  it.each([
    ['setup', '--agent', 'unknown'],
    ['setup', '--plugin', '--agent', 'zcode'],
  ])('rejects invalid target selection before any mutation: %s %s %s', async (...args) => {
    client.setArgv(...args, '--non-interactive');
    expect(await setup(client)).toBe(2);
    expect(JSON.parse(client.stdout.getFullOutput()).reason).toBe(
      'invalid_arguments'
    );
    expect(mocks.setupVercelPlugin).not.toHaveBeenCalled();
    expect(mocks.setupCodexPlugin).not.toHaveBeenCalled();
    expect(mocks.setupCodingAgents).not.toHaveBeenCalled();
  });
});
