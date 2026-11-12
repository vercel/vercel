import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { client } from '../../../mocks/client';
import mcpCommand from '../../../../src/commands/mcp';
import setupMcp from '../../../../src/commands/mcp/mcp';

vi.mock('child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, execSync: vi.fn() };
});

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
  describe('Cursor on Windows', () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(
      process,
      'platform'
    )!;
    const mcpJsonPath = join(homedir(), '.cursor', 'mcp.json');

    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      vi.mocked(execSync).mockReset();
      vi.mocked(execSync).mockReturnValue('' as any);
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', originalPlatform);
      vi.restoreAllMocks();
    });

    it('quotes the one-click URL so cmd.exe does not cut it at &', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      client.nonInteractive = true;

      const code = await setupMcp(client, { clients: ['Cursor'] });
      expect(code).toBe(0);

      const startCall = vi
        .mocked(execSync)
        .mock.calls.map(([cmd]) => String(cmd))
        .find(cmd => cmd.startsWith('start'));
      expect(startCall).toMatch(
        /^start "" "cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=vercel&config=[A-Za-z0-9+/=]+"$/
      );
    });

    it('detects an existing entry in ~/.cursor/mcp.json', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation(
        p => String(p) === mcpJsonPath
      );
      vi.spyOn(fs, 'readFileSync').mockImplementation(((p: any) =>
        String(p) === mcpJsonPath
          ? JSON.stringify({
              mcpServers: { vercel: { url: 'https://mcp.vercel.com' } },
            })
          : '') as any);
      client.nonInteractive = true;

      const code = await setupMcp(client, { clients: ['Cursor'] });
      expect(code).toBe(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.summary).toContain(
        '✅ Cursor: Vercel MCP already configured'
      );
      expect(
        vi
          .mocked(execSync)
          .mock.calls.some(([cmd]) => String(cmd).startsWith('start'))
      ).toBe(false);
    });
  });
});
