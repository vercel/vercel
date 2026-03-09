import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import mcpMain from '../../../../src/commands/mcp';

describe('mcp non-interactive mode', () => {
  beforeEach(() => {
    client.setArgv('mcp');
  });

  it('errors when --clients is missing', async () => {
    client.nonInteractive = true;
    const exitCode = await mcpMain(client);
    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput(
      'In non-interactive mode --clients is required'
    );
    await expect(client.stderr).toOutput('Available clients:');
  });

  it('errors when --clients contains unknown client', async () => {
    client.nonInteractive = true;
    client.setArgv('mcp', '--clients', 'UnknownEditor');
    const exitCode = await mcpMain(client);
    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('Unknown client(s): UnknownEditor');
  });

  it('accepts --clients Cursor and runs setup', async () => {
    client.nonInteractive = true;
    client.setArgv('mcp', '--clients', 'Cursor');
    const exitCode = await mcpMain(client);
    expect(exitCode).toBe(0);
    await expect(client.stderr).toOutput('Setting up Cursor');
  });
});
