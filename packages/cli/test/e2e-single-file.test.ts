import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import fs from 'fs-extra';
import { client } from './mocks/client';
import { setupTmpDir } from './helpers/setup-unit-fixture';
import { getCliPath } from './helpers/get-cli-path';
import { useUser } from './mocks/user';
import { useTeams } from './mocks/team';
import { defaultProject, useProject } from './mocks/project';

// Exercise startup and command routing against the local mock API. No Vercel
// credentials or real deployments are required.
describe('single-file CLI routing', () => {
  it.each([
    'absolute',
    'relative',
    'deploy',
    'cwd',
    'flags before path',
    'deploy flags before path',
    'option value before path',
  ] as const)('deploys an HTML file using %s syntax', async syntax => {
    const cwd = setupTmpDir();
    const source = join(cwd, 'source');
    await fs.ensureDir(source);
    const filename = 'Report Copy.html';
    const path = join(source, filename);
    await fs.writeFile(path, 'single file');
    await fs.writeFile(join(source, 'neighbor.txt'), 'do not upload');
    await fs.outputJson(join(source, '.vercel/project.json'), {
      projectId: 'static',
      orgId: 'team_dummy',
      projectName: 'static',
    });
    useUser({ version: 'northstar' });
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'static',
      name: 'static',
      framework: 'nextjs',
      rootDirectory: 'apps/web',
    });
    const bodies: any[] = [];
    client.scenario.post('/v13/deployments', (req, res) => {
      bodies.push(req.body);
      res.json({
        id: 'dpl_single_file',
        url: 'single-file.vercel.app',
        readyState: 'READY',
        aliasAssigned: true,
        alias: [],
      });
    });
    const args = {
      absolute: [path],
      relative: [join('source', filename)],
      deploy: ['deploy', path],
      cwd: ['--cwd', source, filename],
      'flags before path': ['--prod', path],
      'deploy flags before path': ['deploy', '--no-wait', path],
      'option value before path': ['deploy', '--env', 'NAME=VALUE', path],
    }[syntax];
    const cliPath = getCliPath();
    const child = spawn(
      process.env.VERCEL_CLI_TEST_BINARY ? cliPath : process.execPath,
      [
        ...(process.env.VERCEL_CLI_TEST_BINARY ? [] : [cliPath]),
        ...args,
        '--api',
        client.apiUrl,
        '--token',
        'testtoken',
        '--global-config',
        join(cwd, 'cli-config'),
        '--no-wait',
        '--json',
      ],
      {
        cwd,
        env: {
          PATH: process.env.PATH,
          NO_UPDATE_NOTIFIER: '1',
          VERCEL_TELEMETRY_DISABLED: '1',
          NO_COLOR: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', data => {
      stdout += data;
    });
    child.stderr.on('data', data => {
      stderr += data;
    });
    const timeout = setTimeout(() => child.kill('SIGKILL'), 20_000);
    try {
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        child.on('error', reject);
        child.on('close', resolve);
      });
      expect(exitCode, stderr).toBe(0);
      expect(JSON.parse(stdout)).toMatchObject({
        id: 'dpl_single_file',
        readyState: 'READY',
      });
      expect(bodies).toHaveLength(1);
      expect(
        bodies[0].files.map((file: { file: string }) => file.file)
      ).toEqual([filename]);
      expect(bodies[0].projectSettings).toMatchObject({
        framework: null,
        rootDirectory: null,
        buildCommand: '',
        installCommand: '',
        outputDirectory: null,
      });
    } finally {
      clearTimeout(timeout);
      child.kill();
    }
  });
});
