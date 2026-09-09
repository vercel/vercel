import { describe, it, expect, vi, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import mcpCommand from '../../../../src/commands/mcp';

const { execFileSyncMock, getLinkedProjectMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
  getLinkedProjectMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFileSync: execFileSyncMock,
}));

vi.mock('../../../../src/util/projects/link', () => ({
  getLinkedProject: getLinkedProjectMock,
}));

describe('mcp', () => {
  beforeEach(() => {
    client.reset();
    execFileSyncMock.mockReset();
    execFileSyncMock.mockReturnValue('');
    getLinkedProjectMock.mockReset();
    getLinkedProjectMock.mockResolvedValue({
      status: 'linked',
      org: { type: 'team', id: 'team_123', slug: 'acme' },
      project: { id: 'prj_123', name: 'safe-project' },
    });
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

      await expect(mcpCommand(client)).rejects.toThrow('process.exit(1)');

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

      await expect(mcpCommand(client)).rejects.toThrow('process.exit(1)');

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
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Invalid client(s): Foo');
    });

    it('uses arg-based process execution for one-click URLs', async () => {
      client.setArgv('mcp', '--project', '--clients', 'Cursor');
      (client as { nonInteractive: boolean }).nonInteractive = true;

      getLinkedProjectMock.mockResolvedValue({
        status: 'linked',
        org: { type: 'team', id: 'team_123', slug: 'acme' },
        project: { id: 'prj_123', name: `evil'$(touch /tmp/pwn)` },
      });

      const exitCode = await mcpCommand(client);
      expect(exitCode).toBe(0);

      const openCmd =
        process.platform === 'darwin'
          ? 'open'
          : process.platform === 'win32'
            ? 'cmd'
            : 'xdg-open';
      const openCall = execFileSyncMock.mock.calls.find(
        call => call[0] === openCmd
      );

      expect(openCall).toBeDefined();
      if (!openCall) return;

      const args = openCall[1] as string[];
      const urlArg = process.platform === 'win32' ? args[3] : args[0];
      expect(urlArg).toContain(`name=vercel-evil'$(touch /tmp/pwn)`);
      (client as { nonInteractive: boolean }).nonInteractive = false;
    });
  });
});
