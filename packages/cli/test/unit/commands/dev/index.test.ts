import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import dev from '../../../../src/commands/dev';
import { client } from '../../../mocks/client';
import { type fs, vol } from 'memfs';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { useProject } from '../../../mocks/project';

const { devServerInstances, mockedRepoRoots } = vi.hoisted(() => ({
  devServerInstances: [] as { cwd: string }[],
  mockedRepoRoots: new Map<string, string>(),
}));

vi.mock('../../../../src/util/dev/server', () => {
  class DevServer {
    devCommand = 'framework dev';
    constructor(cwd: string) {
      devServerInstances.push({ cwd });
    }
    feed() {}
    stop() {
      return Promise.resolve();
    }
    start() {}
  }
  return { default: DevServer };
});

// `findRepoRoot` uses `git rev-parse` and real filesystem lookups that
// don't work against memfs in tests. Replace it with a lookup against
// `mockedRepoRoots`: for each `cwd` we look up the longest registered
// path that contains it (the same nearest-ancestor semantics findRepoRoot
// provides via `.git` traversal).
vi.mock('../../../../src/util/link/repo', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../src/util/link/repo')
  >('../../../../src/util/link/repo');
  return {
    ...actual,
    findRepoRoot: async (start: string) => {
      let best: string | undefined;
      for (const root of mockedRepoRoots.keys()) {
        if (start === root || start.startsWith(`${root}/`)) {
          if (!best || root.length > best.length) {
            best = root;
          }
        }
      }
      return best;
    },
  };
});

vi.mock('node:fs/promises', async () => {
  const memfs: { fs: typeof fs } = await vi.importActual('memfs');
  return memfs.fs.promises;
});

vi.mock('node:fs', async () => {
  const memfs: { fs: typeof fs } = await vi.importActual('memfs');
  return memfs;
});

afterEach(() => {
  // __VERCEL_DEV_RUNNING is set when `vercel dev` runs to act as a lock.
  // It's unset as a side effect of  the process exiting. This won't work under test
  // where `vercel dev` can be invoked several times in a row.
  vi.stubEnv('__VERCEL_DEV_RUNNING', undefined);
  vol.reset();
  devServerInstances.length = 0;
  mockedRepoRoots.clear();
});

describe('dev', () => {
  const projectId = 'prj_whatever123';
  const orgId = 'team_123';
  const projectName = 'project-name';
  const projectPath = `/user/name/code/${projectName}`;

  beforeEach(() => {
    useUser();
    useTeams(orgId);
    useProject({
      id: projectId,
      name: projectName,
    });

    const json = {
      '.vercel/project.json': JSON.stringify({
        projectId,
        orgId,
      }),
    };
    vol.fromJSON(json, projectPath);
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'dev';

      client.setArgv(command, '--help');
      const exitCodePromise = dev(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  describe('[dir]', () => {
    it('tracks the dir if supplied', async () => {
      client.setArgv('dev', projectPath);
      const exitCodePromise = dev(client);

      // dev is an odd duck in that normally only exits on SIGTERM
      await expect(exitCodePromise).resolves.toEqual(undefined);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:dir',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--listen', () => {
    it('tracks the listen option if supplied', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(projectPath);

      client.setArgv('dev', '--listen=9090');
      const exitCodePromise = dev(client);

      // dev is an odd duck in that normally only exits on SIGTERM
      await expect(exitCodePromise).resolves.toEqual(undefined);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:listen',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--yes', () => {
    it('tracks the listen option if supplied', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(projectPath);

      client.setArgv('dev', '--yes');
      const exitCodePromise = dev(client);

      // dev is an odd duck in that normally only exits on SIGTERM
      await expect(exitCodePromise).resolves.toEqual(undefined);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:yes',
          value: 'TRUE',
        },
      ]);
    });
  });

  describe('--port', () => {
    it('tracks the listen option if supplied', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(projectPath);

      client.setArgv('dev', '--port=9090');
      const exitCodePromise = dev(client);

      // dev is an odd duck in that normally only exits on SIGTERM
      await expect(exitCodePromise).resolves.toEqual(undefined);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:port',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--confirm', () => {
    it('tracks the listen option if supplied', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(projectPath);

      client.setArgv('dev', '--confirm');
      const exitCodePromise = dev(client);

      // dev is an odd duck in that normally only exits on SIGTERM
      await expect(exitCodePromise).resolves.toEqual(undefined);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:confirm',
          value: 'TRUE',
        },
      ]);
    });
  });

  describe('--local', () => {
    it('shows warning message and starts dev server for unlinked project', async () => {
      const unlinkedPath = '/user/name/code/unlinked-project';
      vol.fromJSON({}, unlinkedPath);

      client.setArgv('dev', '--local', unlinkedPath);
      const exitCodePromise = dev(client);

      await expect(exitCodePromise).resolves.toEqual(undefined);
      await expect(client.stderr).toOutput('Running dev server in local mode');
    });

    it('does not show local mode warning for linked projects', async () => {
      client.setArgv('dev', '--local', projectPath);
      const exitCodePromise = dev(client);

      await expect(exitCodePromise).resolves.toEqual(undefined);
      await expect(client.stderr).not.toOutput(
        'Running dev server in local mode',
        100
      );
    });

    it('tracks telemetry', async () => {
      vi.spyOn(process, 'cwd').mockReturnValue(projectPath);

      client.setArgv('dev', '--local');
      const exitCodePromise = dev(client);

      await expect(exitCodePromise).resolves.toEqual(undefined);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:local',
          value: 'TRUE',
        },
      ]);
    });
  });

  describe('rootDirectory', () => {
    // Reproduces a bug where running `vercel dev` from inside a project
    // subdirectory whose name matches the project's `rootDirectory`
    // setting caused the CLI to append `rootDirectory` again, producing
    // a non-existent path like `monorepo/project1/project1`. After the
    // fix, `rootDirectory` is interpreted relative to the resolved repo
    // root rather than the user's current directory.
    it('resolves rootDirectory relative to repo root, not cwd', async () => {
      const monorepoProjectId = 'prj_monorepo123';
      const monorepoProjectName = 'monorepo-project';
      const subdir = 'web';
      const monorepoRoot = `/user/name/code/my-monorepo`;
      const projectDir = `${monorepoRoot}/${subdir}`;

      mockedRepoRoots.set(monorepoRoot, monorepoRoot);

      useProject({
        id: monorepoProjectId,
        name: monorepoProjectName,
        rootDirectory: subdir,
      });

      vol.reset();
      vol.fromJSON(
        {
          [`${projectDir}/.vercel/project.json`]: JSON.stringify({
            projectId: monorepoProjectId,
            orgId,
          }),
        },
        '/'
      );

      client.setArgv('dev', projectDir);
      const exitCodePromise = dev(client);
      await expect(exitCodePromise).resolves.toEqual(undefined);

      expect(devServerInstances).toHaveLength(1);
      expect(devServerInstances[0].cwd).toBe(projectDir);
    });

    // Edge case: the monorepo folder name happens to match the project's
    // rootDirectory. e.g. the monorepo is at `/some/path/project-awesome`
    // and contains a subproject at `/some/path/project-awesome/project-awesome`.
    // A pure path-based heuristic would incorrectly skip the join here; the
    // fix uses the repo root so the project path is computed correctly.
    it('handles a monorepo folder name that matches rootDirectory', async () => {
      const matchingProjectId = 'prj_matching123';
      const matchingProjectName = 'matching-name-project';
      const name = 'project-awesome';
      const monorepoRoot = `/some/path/${name}`;
      const projectDir = `${monorepoRoot}/${name}`;

      mockedRepoRoots.set(monorepoRoot, monorepoRoot);

      useProject({
        id: matchingProjectId,
        name: matchingProjectName,
        rootDirectory: name,
      });

      vol.reset();
      vol.fromJSON(
        {
          [`${monorepoRoot}/.vercel/project.json`]: JSON.stringify({
            projectId: matchingProjectId,
            orgId,
          }),
        },
        '/'
      );

      client.setArgv('dev', monorepoRoot);
      const exitCodePromise = dev(client);
      await expect(exitCodePromise).resolves.toEqual(undefined);

      expect(devServerInstances).toHaveLength(1);
      expect(devServerInstances[0].cwd).toBe(projectDir);
    });
  });
});
