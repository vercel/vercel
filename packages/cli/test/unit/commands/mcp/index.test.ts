import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFileSync } from 'child_process';
import { EventEmitter } from 'events';
import open from 'open';
import { client } from '../../../mocks/client';
import mcpCommand from '../../../../src/commands/mcp';
import setupMcp from '../../../../src/commands/mcp/mcp';

vi.mock('child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execFileSync: vi.fn(),
  };
});

vi.mock('open', () => ({
  default: vi.fn(),
}));

describe('mcp', () => {
  beforeEach(() => {
    client.reset();
    vi.clearAllMocks();
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
        'next',
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
      expect(payload.next).toEqual([
        {
          command: 'vercel link',
          when: 'To link a project for project-specific MCP (optional)',
        },
      ]);
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

  describe('interactive mode', () => {
    it('returns 1 and errors when --clients contains invalid names', async () => {
      client.setArgv('mcp', '--clients', 'Foo');
      (client as { nonInteractive: boolean }).nonInteractive = false;

      const exitCode = await mcpCommand(client);
      expect(exitCode).toBe(2);
      await expect(client.stderr).toOutput('Invalid client(s): Foo');
    });
  });

  it('uses execFileSync without a shell for Claude Code setup', async () => {
    vi.mocked(execFileSync).mockReturnValue('');
    client.nonInteractive = true;

    const code = await setupMcp(client, { clients: ['Claude Code'] });
    expect(code).toBe(0);
    expect(execFileSync).toHaveBeenCalledWith(
      'claude',
      ['mcp', 'add', '--transport', 'http', 'vercel', 'https://mcp.vercel.com'],
      { stdio: 'pipe', encoding: 'utf8' }
    );
  });

  it('opens VS Code one-click installer via open() and checks extensions via execFileSync', async () => {
    vi.mocked(execFileSync).mockReturnValue('github.copilot\n');
    vi.mocked(open).mockResolvedValue({} as any);
    client.nonInteractive = true;

    const code = await setupMcp(client, { clients: ['VS Code with Copilot'] });
    expect(code).toBe(0);
    expect(execFileSync).toHaveBeenCalledWith('code', ['--list-extensions'], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    expect(open).toHaveBeenCalledTimes(1);
    expect(vi.mocked(open).mock.calls[0][0]).toMatch(/^vscode:mcp\/install\?/);
  });

  it('reports failure when the deep-link launcher exits with non-zero code', async () => {
    vi.mocked(execFileSync).mockReturnValue('github.copilot\n');
    const fakeChild = new EventEmitter();
    vi.mocked(open).mockImplementation(async () => {
      setTimeout(() => fakeChild.emit('close', 1), 0);
      return fakeChild as any;
    });
    client.nonInteractive = true;

    const code = await setupMcp(client, { clients: ['VS Code with Copilot'] });
    expect(code).toBe(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.summary).toContain(
      '❌ VS Code: Failed to open one-click installer'
    );
  });
});
