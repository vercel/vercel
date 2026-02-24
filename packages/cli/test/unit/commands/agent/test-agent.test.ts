import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import agentCommand from '../../../../src/commands/agent';

describe('agent command', () => {
  beforeEach(() => {
    client.reset();
  });

  it('shows help when --help is passed', async () => {
    client.setArgv('agent', '--help');
    const exitCode = await agentCommand(client);
    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain('Manage AI agent OAuth');
    expect(client.stderr.getFullOutput()).toContain('setup');
  });

  it('shows help for agent setup when subcommand is setup and --help', async () => {
    client.setArgv('agent', 'setup', '--help');
    const exitCode = await agentCommand(client);
    expect(exitCode).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Create an AI agent OAuth app'
    );
  });

  it('returns 2 for unknown subcommand', async () => {
    client.setArgv('agent', 'unknown-sub');
    const exitCode = await agentCommand(client);
    expect(exitCode).toBe(2);
  });
});
