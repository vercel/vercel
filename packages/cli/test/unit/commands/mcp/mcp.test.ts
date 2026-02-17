import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import mcpCommand from '../../../../src/commands/mcp/index';
import * as linkModule from '../../../../src/util/projects/link';

vi.setConfig({ testTimeout: 600000 });

vi.mock('../../../../src/util/projects/link');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);

describe('mcp', () => {
  beforeEach(() => {
    client.reset();
    vi.clearAllMocks();

    mockedGetLinkedProject.mockResolvedValue({
      status: 'not_linked',
      org: null,
      project: null,
    });
  });

  describe('getAvailableClients', () => {
    it('should include OpenCode in available clients', async () => {
      client.setArgv('mcp');

      const checkboxMock = vi.fn().mockResolvedValue([]);
      client.input.checkbox = checkboxMock;

      await mcpCommand(client);

      expect(checkboxMock).toHaveBeenCalledWith(
        expect.objectContaining({
          choices: expect.arrayContaining([
            expect.objectContaining({ name: 'OpenCode' }),
          ]),
        })
      );
    });
  });

  describe('OpenCode setup - no selection', () => {
    it('should exit gracefully when no clients are selected', async () => {
      client.setArgv('mcp');
      client.input.checkbox = vi.fn().mockResolvedValue([]);

      const exitCodePromise = mcpCommand(client);

      await expect(client.stderr).toOutput('No clients selected');

      expect(await exitCodePromise).toBe(0);
    });
  });

  describe('OpenCode setup - project-specific URL', () => {
    it('should show project-specific URL message with --project flag', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        status: 'linked',
        org: { slug: 'my-org' } as any,
        project: { name: 'my-project' } as any,
      });

      client.setArgv('mcp', '--project');
      client.input.checkbox = vi.fn().mockResolvedValue([]);

      const exitCodePromise = mcpCommand(client);

      await expect(client.stderr).toOutput(
        'Project-specific URL: https://mcp.vercel.com/my-org/my-project'
      );

      expect(await exitCodePromise).toBe(0);
    });

    it('should show error when no linked project found with --project flag', async () => {
      mockedGetLinkedProject.mockResolvedValue({
        status: 'not_linked',
        org: null,
        project: null,
      });

      client.setArgv('mcp', '--project');

      const exitCodePromise = mcpCommand(client);

      await expect(client.stderr).toOutput('No linked project found');

      expect(await exitCodePromise).toBe(1);
    });
  });
});
