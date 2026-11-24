import { describe, it, expect, vi, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import mcpCommand from '../../../../src/commands/mcp';
import setupMcp from '../../../../src/commands/mcp/mcp';

describe('mcp', () => {
  beforeEach(() => {
    client.reset();
  });

  it.each([
    false,
    true,
  ])('preserves the manual authentication handoff (nonInteractive=%s)', async nonInteractive => {
    client.nonInteractive = nonInteractive;
    const code = await setupMcp(client, {
      clients: ['Claude.ai and Claude for desktop'],
    });
    expect(code).toBe(0);
    if (nonInteractive) {
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(Object.keys(payload).sort()).toEqual([
        'hint',
        'status',
        'summary',
      ]);
      expect(payload.status).toBe('ok');
      expect(payload.summary).toEqual([
        'ℹ️  Claude.ai/Desktop: Manual setup required',
      ]);
      expect(payload.hint).toContain(
        'Complete any required setup and authentication'
      );
      expect(client.stderr.getFullOutput()).toBe('');
    } else {
      expect(client.stdout.getFullOutput()).toBe('');
      const text = client.stderr.getFullOutput();
      expect(text).toContain('Manual setup required');
      expect(text).toContain('Complete any required setup and authentication');
      expect(text).not.toContain('Setup complete!');
    }
  });

  describe('--non-interactive', () => {
    it('outputs error JSON and exits when --clients is missing', async () => {
      client.setArgv('mcp', '--non-interactive');
      (client as { nonInteractive: boolean }).nonInteractive = true;

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });

      await expect(mcpCommand(client)).rejects.toThrow('process.exit(2)');

      const output = client.stdout.getFullOutput();
      const payload = JSON.parse(output);
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('missing_clients');
      expect(payload.message).toContain('--clients is required');

      exitSpy.mockRestore();
      (client as { nonInteractive: boolean }).nonInteractive = false;
    });

    it('outputs error JSON and exits when invalid clients are provided', async () => {
      client.setArgv('mcp', '--clients', 'Foo,Cursor', '--non-interactive');
      (client as { nonInteractive: boolean }).nonInteractive = true;

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });

      await expect(mcpCommand(client)).rejects.toThrow('process.exit(2)');

      const output = client.stdout.getFullOutput();
      const payload = JSON.parse(output);
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('invalid_clients');
      expect(payload.message).toContain('Invalid client(s): Foo');
      expect(payload.message).toContain('Valid options:');

      exitSpy.mockRestore();
      (client as { nonInteractive: boolean }).nonInteractive = false;
    });
  });

  it('warns that --project is deprecated and sets up the shared endpoint', async () => {
    client.setArgv(
      'mcp',
      '--project',
      '--clients',
      'Claude.ai and Claude for desktop'
    );

    const exitCode = await mcpCommand(client);
    expect(exitCode).toBe(0);
    const text = client.stderr.getFullOutput();
    expect(text).toContain('The --project flag is deprecated');
    expect(text).toContain('• Name: Vercel\n');
    expect(text).toContain('• URL: https://mcp.vercel.com\n');
    expect(text).not.toContain('Project-specific URL');
  });

  it('hides --project from help', async () => {
    client.setArgv('mcp', '--help');

    const exitCode = await mcpCommand(client);
    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).not.toContain('--project');
  });

  describe('interactive mode', () => {
    it('returns 1 and errors when --clients contains invalid names', async () => {
      client.setArgv('mcp', '--clients', 'Foo');
      (client as { nonInteractive: boolean }).nonInteractive = false;

      const exitCode = await mcpCommand(client);
      expect(exitCode).toBe(2);
      await expect(client.stderr).toOutput('Invalid client(s): Foo');
    });
  });
});
