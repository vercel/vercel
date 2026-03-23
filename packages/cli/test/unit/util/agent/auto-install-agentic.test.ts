import { describe, beforeEach, expect, it, vi } from 'vitest';
import { join } from 'path';
import fs from 'fs-extra';

const mockPaths = vi.hoisted(() => ({
  configPath: '/tmp/vercel-test-config',
  homePath: '/tmp/vercel-test-home',
}));
vi.mock('../../../../src/util/config/global-path', () => ({
  default: () => mockPaths.configPath,
}));
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: () => mockPaths.homePath };
});

import { client } from '../../../mocks/client';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import {
  BEST_PRACTICES_START,
  BEST_PRACTICES_END,
} from '../../../../src/commands/agent/init';

const mockAgentInit = vi.fn().mockResolvedValue(0);
vi.mock('../../../../src/commands/agent/init', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../src/commands/agent/init')
  >('../../../../src/commands/agent/init');
  return {
    ...actual,
    default: (...args: unknown[]) => mockAgentInit(...args),
  };
});

const mockSpawn = vi.fn(() => ({
  on: vi.fn((event: string, cb: (code: number) => void) => {
    if (event === 'close') {
      setTimeout(() => cb(0), 10);
    }
  }),
}));
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

import { autoInstallAgentTooling } from '../../../../src/util/agent/auto-install-agentic';

describe('autoInstallAgentTooling', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = setupTmpDir();
    mockPaths.configPath = setupTmpDir('mock-config');
    mockPaths.homePath = setupTmpDir('mock-home');
    fs.mkdirpSync(mockPaths.configPath);
    client.cwd = cwd;
    client.isAgent = false;
    client.agentName = undefined;
    vi.clearAllMocks();
  });

  describe('agent init', () => {
    it('should skip when skipAgentInit is true', async () => {
      await autoInstallAgentTooling(client, {
        skipAgentInit: true,
        autoConfirm: true,
      });
      expect(mockAgentInit).not.toHaveBeenCalled();
    });

    it('should call agentInit when markers exist', async () => {
      const existing = `# Project\n${BEST_PRACTICES_START}\nold\n${BEST_PRACTICES_END}\n`;
      await fs.writeFile(join(cwd, 'AGENTS.md'), existing);

      await autoInstallAgentTooling(client, { autoConfirm: true });

      expect(mockAgentInit).toHaveBeenCalledWith(client, true);
    });

    it('should call agentInit when client is an agent', async () => {
      client.isAgent = true;
      client.agentName = 'claude';

      await autoInstallAgentTooling(client, { autoConfirm: true });

      expect(mockAgentInit).toHaveBeenCalledWith(client, true);
    });

    it('should call agentInit with autoConfirm when no markers', async () => {
      await autoInstallAgentTooling(client, { autoConfirm: true });

      expect(mockAgentInit).toHaveBeenCalledWith(client, true);
    });

    it('should prompt when no autoConfirm and no markers', async () => {
      const promise = autoInstallAgentTooling(client, {});

      await expect(client.stderr).toOutput('Add Vercel best practices');
      client.stdin.write('y\n');

      await promise;
      expect(mockAgentInit).toHaveBeenCalledWith(client, true);
    });

    it('should not call agentInit when user declines', async () => {
      const promise = autoInstallAgentTooling(client, {});

      await expect(client.stderr).toOutput('Add Vercel best practices');
      client.stdin.write('n\n');

      await promise;
      expect(mockAgentInit).not.toHaveBeenCalled();
    });
  });

  describe('plugin install', () => {
    it('should use claude-code target when agent is claude', async () => {
      client.isAgent = true;
      client.agentName = 'claude';

      await autoInstallAgentTooling(client, {
        skipAgentInit: true,
        autoConfirm: true,
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['--target', 'claude-code']),
        expect.any(Object)
      );
    });

    it('should use cursor target when agent is cursor', async () => {
      client.isAgent = true;
      client.agentName = 'cursor';

      await autoInstallAgentTooling(client, {
        skipAgentInit: true,
        autoConfirm: true,
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['--target', 'cursor']),
        expect.any(Object)
      );
    });

    it('should prompt for plugin when not auto-confirmed', async () => {
      client.isAgent = true;
      client.agentName = 'claude';

      const promise = autoInstallAgentTooling(client, { skipAgentInit: true });

      await expect(client.stderr).toOutput('Install the Vercel plugin?');
      client.stdin.write('y\n');

      await promise;
      expect(mockSpawn).toHaveBeenCalled();
    });

    it('should not install when user declines plugin', async () => {
      client.isAgent = true;
      client.agentName = 'claude';

      const promise = autoInstallAgentTooling(client, { skipAgentInit: true });

      await expect(client.stderr).toOutput('Install the Vercel plugin?');
      client.stdin.write('n\n');

      await promise;
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });

  describe('non-TTY behavior', () => {
    it('should skip for non-agent in non-TTY', async () => {
      (client.stdin as any).isTTY = false;
      client.isAgent = false;

      await autoInstallAgentTooling(client, {});

      expect(mockAgentInit).not.toHaveBeenCalled();
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should auto-approve for agent in non-TTY', async () => {
      (client.stdin as any).isTTY = false;
      client.isAgent = true;
      client.agentName = 'claude';

      await autoInstallAgentTooling(client, {});

      expect(mockAgentInit).toHaveBeenCalledWith(client, true);
      expect(mockSpawn).toHaveBeenCalled();
    });
  });

  describe('dismissal persistence', () => {
    it('should not prompt again after user dismisses agent init', async () => {
      const promise1 = autoInstallAgentTooling(client, {
        skipAgentInit: false,
      });
      await expect(client.stderr).toOutput('Add Vercel best practices');
      client.stdin.write('n\n');
      await promise1;
      expect(mockAgentInit).not.toHaveBeenCalled();

      client.reset();
      client.cwd = cwd;
      vi.clearAllMocks();

      await autoInstallAgentTooling(client, { autoConfirm: true });
      expect(mockAgentInit).not.toHaveBeenCalled();
    });

    it('should not prompt again after user dismisses plugin', async () => {
      client.isAgent = true;
      client.agentName = 'claude';

      const promise1 = autoInstallAgentTooling(client, {
        skipAgentInit: true,
      });
      await expect(client.stderr).toOutput('Install the Vercel plugin?');
      client.stdin.write('n\n');
      await promise1;
      expect(mockSpawn).not.toHaveBeenCalled();

      client.reset();
      client.cwd = cwd;
      client.isAgent = true;
      client.agentName = 'claude';
      vi.clearAllMocks();

      await autoInstallAgentTooling(client, {
        skipAgentInit: true,
        autoConfirm: true,
      });
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });
});
