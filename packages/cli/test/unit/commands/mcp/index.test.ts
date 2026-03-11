import { describe, it, expect, vi, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import mcpCommand from '../../../../src/commands/mcp';

describe('mcp', () => {
  beforeEach(() => {
    client.reset();
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
  });
});
