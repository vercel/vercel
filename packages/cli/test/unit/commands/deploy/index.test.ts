import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bytes from 'bytes';
import fs from 'fs-extra';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { fileNameSymbol } from '@vercel/client';
import * as vercelClient from '@vercel/client';
import * as fetchUtil from '../../../../src/util/fetch';
import * as oauth from '../../../../src/util/oauth';
import { Response } from '../../../../src/util/fetch-primitives';
import { client } from '../../../mocks/client';
import deploy from '../../../../src/commands/deploy';
import {
  setupUnitFixture,
  setupTmpDir,
} from '../../../helpers/setup-unit-fixture';
import {
  defaultProject,
  useProject,
  useUnknownProject,
} from '../../../mocks/project';
import { useDeployment, useBuildLogs } from '../../../mocks/deployment';
import { useTeams, createTeam } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import humanizePath from '../../../../src/util/humanize-path';
import sleep from '../../../../src/util/sleep';
import * as createDeployModule from '../../../../src/util/deploy/create-deploy';
import { BuildError } from '../../../../src/util/errors-ts';
import type Now from '../../../../src/util';
import type { Deployment } from '@vercel-internals/types';

describe('deploy', () => {
  describe('--non-interactive', () => {
    it('outputs action_required JSON and exits when not linked and multiple teams (no --scope)', async () => {
      const cwd = setupTmpDir();
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      createTeam();
      client.cwd = cwd;
      client.setArgv('deploy', '--non-interactive');
      (client as { nonInteractive: boolean }).nonInteractive = true;

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(deploy(client)).rejects.toThrow('process.exit(1)');

      expect(logSpy).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(logSpy.mock.calls[0][0]);
      expect(payload.status).toBe('action_required');
      expect(payload.reason).toBe('missing_scope');
      expect(payload.message).toContain('--scope');
      expect(payload.message).toContain('non-interactive');
      expect(Array.isArray(payload.choices)).toBe(true);
      expect(payload.choices.length).toBeGreaterThanOrEqual(2);
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      logSpy.mockRestore();
      (client as { nonInteractive: boolean }).nonInteractive = false;
    });

    it('outputs error JSON when deploy continue is missing --deployment', async () => {
      vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
        throw new Error('exit');
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      (client as { nonInteractive: boolean }).nonInteractive = true;
      client.setArgv('deploy', 'continue');
      const exitCodePromise = deploy(client);

      await expect(exitCodePromise).rejects.toThrow('exit');
      expect(logSpy).toHaveBeenCalled();
      const payload = JSON.parse(
        logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
      );
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_id',
        message:
          'Missing required --deployment option. Provide the deployment ID to continue.',
        next: [
          expect.objectContaining({
            command: 'vercel deploy continue --deployment <DEPLOYMENT>',
          }),
        ],
      });

      vi.restoreAllMocks();
      (client as { nonInteractive: boolean }).nonInteractive = false;
    });
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'deploy';

      client.setArgv(command, '--help');
      const exitCodePromise = deploy(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      const helpOutput = client.stderr.getFullOutput();
      expect(helpOutput).toContain('--dry');
      expect(helpOutput).toContain('vercel deploy --dry --json');
      expect(helpOutput).toContain('--turbo');
      expect(helpOutput).toContain('vercel deploy --turbo');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  it('sends buildMachine turbo in the deployment creation request', async () => {
    const user = useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'static',
      id: 'static',
    });

    let body: Record<string, unknown> | undefined;
    client.scenario.post(`/v13/deployments`, (req, res) => {
      body = req.body;
      res.json({
        creator: {
          uid: user.id,
          username: user.username,
        },
        id: 'dpl_build_machine_test',
        readyState: 'BUILDING',
        url: 'build-machine-test.vercel.app',
      });
    });

    client.cwd = setupUnitFixture('commands/deploy/static');
    client.setArgv('deploy', '--turbo', '--no-wait');

    expect(await deploy(client)).toEqual(0);
    expect(body).toMatchObject({ buildMachine: 'turbo' });
  });

  it('should reject deploying multiple files', async () => {
    client.setArgv('deploy', __filename, join(__dirname, 'inspect.test.ts'));
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      `Error: Can't deploy more than one path.\n`
    );
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "deploy"').toEqual(1);
  });

  it('should reject deploying a directory that does not exist', async () => {
    const badName = 'does-not-exist';
    client.setArgv('deploy', badName);
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      `Error: Could not find “${humanizePath(
        join(client.cwd, 'does-not-exist')
      )}”\n`
    );
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "deploy"').toEqual(1);
  });

  it('should print a dry file distribution without deploying', async () => {
    const cwd = setupTmpDir('deploy-dry');
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'deploy-dry',
      name: 'deploy-dry',
      framework: 'nextjs',
    });
    await fs.outputFile(join(cwd, 'src/index.js'), 'console.log("hello")');
    await fs.outputFile(join(cwd, 'src/data.json'), 'x'.repeat(1024));
    await fs.outputFile(join(cwd, 'public/hero.png'), 'x'.repeat(2048));
    await fs.outputFile(join(cwd, 'ignored.txt'), 'x'.repeat(4096));
    await fs.writeFile(join(cwd, '.vercelignore'), 'ignored.txt\n');
    await fs.outputFile(
      join(cwd, '.vercel/project.json'),
      JSON.stringify({
        orgId: 'team_dummy',
        projectId: 'deploy-dry',
      })
    );

    client.setArgv('deploy', cwd, '--dry');
    const exitCode = await deploy(client);
    const output = client.stderr.getFullOutput();

    expect(exitCode).toEqual(0);
    expect(output).toContain('Deployment Dry Run');
    expect(output).toContain('Detected Framework Preset: Next.js (nextjs)');
    expect(output).toContain('Included: 4 files');
    expect(output).toContain('Ignored: 2 paths');
    expect(output).toContain('public');
    expect(output).toContain('src');
    expect(output).toContain('Largest Files');
    expect(output).toContain('public/hero.png');
    expect(output).not.toContain(
      'No files were uploaded and no deployment was created.'
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:dry', value: 'TRUE' },
      { key: 'argument:project-path', value: '[REDACTED]' },
      { key: 'target_environment', value: 'preview' },
    ]);
  });

  it('should reject a dry run when the project is not linked', async () => {
    const cwd = setupTmpDir('deploy-dry-unlinked');
    await fs.outputFile(join(cwd, 'index.js'), 'export default 1;');

    client.setArgv('deploy', cwd, '--dry', '--yes');
    const exitCodePromise = deploy(client);

    await expect(client.stderr).toOutput(
      'Error: Project is not linked. Run `vercel link` first.\n'
    );
    expect(await exitCodePromise).toEqual(1);
    expect(await fs.pathExists(join(cwd, '.vercel'))).toBe(false);
    expect(await fs.pathExists(join(cwd, '.gitignore'))).toBe(false);
  });

  it('should print dry output as JSON', async () => {
    const cwd = setupTmpDir('deploy-dry-json');
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'deploy-dry-json',
      name: 'deploy-dry-json',
      framework: 'nextjs',
    });
    await fs.outputFile(join(cwd, 'api/index.js'), 'export default () => {}');
    await fs.outputFile(join(cwd, 'public/logo.svg'), '<svg></svg>');
    await fs.outputJson(join(cwd, 'vercel.json'), {
      framework: 'vite',
    });
    await fs.outputFile(
      join(cwd, '.vercel/project.json'),
      JSON.stringify({
        orgId: 'team_dummy',
        projectId: 'deploy-dry-json',
      })
    );

    client.setArgv('deploy', cwd, '--dry', '--format=json');
    const exitCode = await deploy(client);
    const payload = JSON.parse(client.stdout.getFullOutput());

    expect(exitCode).toEqual(0);
    expect(payload).toMatchObject({
      framework: {
        name: 'Vite',
        slug: 'vite',
      },
      basePath: cwd,
      fileCount: 3,
      ignoredCount: 1,
    });
    expect(payload.directories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'api', fileCount: 1 }),
        expect.objectContaining({ path: 'public', fileCount: 1 }),
      ])
    );
    expect(payload.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'api/index.js' }),
        expect.objectContaining({ path: 'public/logo.svg' }),
      ])
    );
  });

  it('should include prebuilt filePathMap collisions in dry-run JSON', async () => {
    const cwd = setupTmpDir('deploy-dry-prebuilt-warning');
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'deploy-dry-prebuilt-warning',
      name: 'deploy-dry-prebuilt-warning',
    });
    await fs.outputFile(join(cwd, 'README.md'), 'ignored source');
    await fs.outputFile(join(cwd, '.vercelignore'), 'README.md\n');
    await fs.outputJson(join(cwd, '.vercel/project.json'), {
      orgId: 'team_dummy',
      projectId: 'deploy-dry-prebuilt-warning',
    });
    await fs.outputJson(join(cwd, '.vercel/output/config.json'), {
      version: 3,
    });
    await fs.outputJson(
      join(cwd, '.vercel/output/functions/api/example.func/.vc-config.json'),
      {
        runtime: 'nodejs20.x',
        handler: 'index.js',
        filePathMap: {
          'README.md': 'README.md',
        },
      }
    );

    client.setArgv('deploy', cwd, '--prebuilt', '--dry', '--format=json');
    const exitCode = await deploy(client);
    const payload = JSON.parse(client.stdout.getFullOutput());

    expect(exitCode).toEqual(0);
    expect(payload.warning).toMatchObject({
      code: 'PREBUILT_FILEPATHMAP_IGNORED',
      message: expect.stringContaining('README.md'),
    });
    expect(client.stderr.getFullOutput()).toContain(
      '`.vercelignore` excludes 1 file the prebuilt functions need'
    );
  });

  it('should print every dry file as JSON when stdout is non-TTY', async () => {
    const cwd = setupTmpDir('deploy-dry-non-tty');
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'deploy-dry-non-tty',
      name: 'deploy-dry-non-tty',
    });
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        fs.outputFile(join(cwd, `src/file-${index}.js`), String(index))
      )
    );
    await fs.outputFile(
      join(cwd, '.vercel/project.json'),
      JSON.stringify({
        orgId: 'team_dummy',
        projectId: 'deploy-dry-non-tty',
      })
    );

    client.stdout.isTTY = false;
    client.setArgv('deploy', cwd, '--dry');
    const exitCode = await deploy(client);
    const payload = JSON.parse(client.stdout.getFullOutput());

    expect(exitCode).toEqual(0);
    expect(payload.framework).toEqual({
      name: 'Other',
      slug: null,
    });
    expect(payload.fileCount).toEqual(12);
    expect(payload.files).toHaveLength(12);
    expect(payload.largestFiles).toHaveLength(10);
    expect(payload.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'src/file-0.js' }),
        expect.objectContaining({ path: 'src/file-11.js' }),
      ])
    );
  });

  it('should inspect the archive payload when `--archive=tgz` is used', async () => {
    const cwd = setupTmpDir('deploy-dry-archive');
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'deploy-dry-archive',
      name: 'deploy-dry-archive',
    });
    await fs.outputFile(join(cwd, 'src/index.js'), 'export default 1;');
    await fs.outputFile(
      join(cwd, '.vercel/project.json'),
      JSON.stringify({
        orgId: 'team_dummy',
        projectId: 'deploy-dry-archive',
      })
    );

    client.setArgv('deploy', cwd, '--dry', '--archive=tgz', '--format=json');
    const exitCode = await deploy(client);
    const payload = JSON.parse(client.stdout.getFullOutput());

    expect(exitCode).toEqual(0);
    expect(payload.files).toEqual([
      expect.objectContaining({
        path: '.vercel/source.tgz.part1',
      }),
    ]);
  });

  it('should reject deploying when `--prebuilt` is used and `vc build` failed before Builders', async () => {
    const cwd = setupUnitFixture('build-output-api-failed-before-builds');

    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'build-output-api-failed-before-builds',
      name: 'build-output-api-failed-before-builds',
    });

    client.setArgv('deploy', cwd, '--prebuilt');
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      '> Prebuilt deployment cannot be created because `vercel build` failed with error:\n\nError: The build failed (top-level)\n'
    );
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "deploy"').toEqual(1);
  });

  it('should reject deploying when `--prebuilt` is used and `vc build` failed within a Builder', async () => {
    const cwd = setupUnitFixture('build-output-api-failed-within-build');

    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'build-output-api-failed-within-build',
      name: 'build-output-api-failed-within-build',
    });

    client.setArgv('deploy', cwd, '--prebuilt');
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      '> Prebuilt deployment cannot be created because `vercel build` failed with error:\n\nError: The build failed within a Builder\n'
    );
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "deploy"').toEqual(1);
  });

  it('should reject deploying a directory that does not contain ".vercel/output" when `--prebuilt` is used', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'static',
      id: 'static',
    });

    client.cwd = setupUnitFixture('commands/deploy/static');
    client.setArgv('deploy', '--prebuilt');
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      'Error: The "--prebuilt" option was used, but no prebuilt output found in ".vercel/output". Run `vercel build` to generate a local build.\n'
    );
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "deploy"').toEqual(1);
  });

  it('should reject a dry run when `--prebuilt` output does not exist', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'static',
      id: 'static',
    });

    client.cwd = setupUnitFixture('commands/deploy/static');
    client.setArgv('deploy', '--prebuilt', '--dry');
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      'Error: The "--prebuilt" option was used, but no prebuilt output found in ".vercel/output". Run `vercel build` to generate a local build.\n'
    );
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "deploy"').toEqual(1);
  });

  it('should reject deploying a directory that was built with a different target environment when `--prebuilt --prod` is used on "preview" output', async () => {
    const cwd = setupUnitFixture('build-output-api-preview');

    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'build-output-api-preview',
      name: 'build-output-api-preview',
    });

    client.setArgv('deploy', cwd, '--prebuilt', '--prod');
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      'Error: The "--prebuilt" option was used with the target environment "production",' +
        ' but the prebuilt output found in ".vercel/output" was built with target environment "preview".' +
        ' Please run `vercel --prebuilt`.\n' +
        'Learn More: https://vercel.link/prebuilt-environment-mismatch\n'
    );
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "deploy"').toEqual(1);
  });

  it('should reject deploying a directory that was built with a different target environment when `--prebuilt` is used on "production" output', async () => {
    const cwd = setupUnitFixture('build-output-api-production');

    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'build-output-api-production',
      name: 'build-output-api-production',
    });

    client.setArgv('deploy', cwd, '--prebuilt');
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      'Error: The "--prebuilt" option was used with the target environment "preview",' +
        ' but the prebuilt output found in ".vercel/output" was built with target environment "production".' +
        ' Please run `vercel --prebuilt --prod`.\n' +
        'Learn More: https://vercel.link/prebuilt-environment-mismatch\n'
    );
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "deploy"').toEqual(1);
  });

  it('should reject deploying "version: 1"', async () => {
    client.setArgv('deploy');
    client.localConfig = {
      [fileNameSymbol]: 'vercel.json',
      version: 1,
    };
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      'Error: The value of the `version` property within vercel.json can only be `2`.\n'
    );
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "deploy"').toEqual(1);
  });

  it('should reject deploying "version: {}"', async () => {
    client.setArgv('deploy');
    client.localConfig = {
      [fileNameSymbol]: 'vercel.json',
      // @ts-ignore
      version: {},
    };
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      'Error: The `version` property inside your vercel.json file must be a number.\n'
    );
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "deploy"').toEqual(1);
  });

  it('should prefer an explicit target config over early cwd config', async () => {
    const targetDir = setupTmpDir('deploy-explicit-target-config');
    await fs.writeJSON(join(targetDir, 'now.json'), { version: 1 });
    await fs.writeFile(join(targetDir, 'index.txt'), 'hello');

    client.cwd = setupUnitFixture('commands/deploy/static');
    client.setArgv('deploy', targetDir);
    client.localConfig = {
      [fileNameSymbol]: 'vercel.json',
      version: 2,
    };

    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      'Error: The `now.json` file is deprecated and no longer supported. Please rename it to `vercel.json`.\n'
    );
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "deploy"').toEqual(1);
  });

  it('should send a tgz file when `--archive=tgz`', async () => {
    const user = useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'static',
      id: 'static',
    });

    let body: any;
    client.scenario.post(`/v13/deployments`, (req, res) => {
      body = req.body;
      res.json({
        creator: {
          uid: user.id,
          username: user.username,
        },
        id: 'dpl_archive_test',
      });
    });
    client.scenario.get(`/v13/deployments/dpl_archive_test`, (req, res) => {
      res.json({
        creator: {
          uid: user.id,
          username: user.username,
        },
        id: 'dpl_archive_test',
        readyState: 'READY',
        aliasAssigned: true,
        alias: [],
      });
    });
    client.scenario.get(`/v10/now/deployments/dpl_archive_test`, (req, res) => {
      res.json({
        creator: {
          uid: user.id,
          username: user.username,
        },
        id: 'dpl_archive_test',
        readyState: 'READY',
        aliasAssigned: true,
        alias: [],
      });
    });

    client.cwd = setupUnitFixture('commands/deploy/static');
    client.setArgv('deploy', '--archive=tgz');
    const exitCode = await deploy(client);
    expect(exitCode).toEqual(0);
    expect(body?.files?.length).toEqual(1);
    expect(body?.files?.[0].file).toEqual('.vercel/source.tgz.part1');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'option:archive',
        value: 'tgz',
      },
      { key: 'target_environment', value: 'preview' },
      { key: 'output:deployment-id', value: 'dpl_archive_test' },
    ]);
  });

  it('should send a tgz file when `deploy continue --archive=tgz`', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'static',
      id: 'static',
    });

    let body: any;
    client.scenario.post(`/deployments/dpl_continue/continue`, (req, res) => {
      body = req.body;
      res.json({
        id: 'dpl_continue',
        url: 'continue.vercel.app',
        readyState: 'READY',
        aliasAssigned: true,
        alias: [],
      });
    });

    client.cwd = setupUnitFixture('commands/deploy/static-with-build-output');
    client.setArgv(
      'deploy',
      'continue',
      '--deployment',
      'dpl_continue',
      '--archive=tgz'
    );
    const exitCode = await deploy(client);
    expect(exitCode).toEqual(0);
    const fileNames = body?.files?.map((f: any) => f.file);
    expect(fileNames).toContain('.vercel/source.tgz.part1');
    expect(fileNames).toContain('.vercel/output/provision.json');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:continue',
        value: 'continue',
      },
      {
        key: 'option:deployment',
        value: '[REDACTED]',
      },
      {
        key: 'option:archive',
        value: 'tgz',
      },
    ]);
  });

  it('passes the configured dispatcher to deploy continue', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({ ...defaultProject, name: 'static', id: 'static' });
    const dispatcher = { dispatch: vi.fn() };
    const getDispatcher = vi
      .spyOn(fetchUtil, 'getFetchDispatcher')
      .mockReturnValue(dispatcher);
    const continueDeployment = vi
      .spyOn(vercelClient, 'continueDeployment')
      .mockImplementation(async function* () {
        yield {
          type: 'created',
          payload: {
            id: 'dpl_continue',
            url: 'continue.vercel.app',
            readyState: 'READY',
            aliasAssigned: true,
            alias: [],
          },
        };
      });
    try {
      client.cwd = setupUnitFixture('commands/deploy/static-with-build-output');
      client.setArgv('deploy', 'continue', '--deployment', 'dpl_continue');
      expect(await deploy(client)).toBe(0);
      expect(continueDeployment).toHaveBeenCalledWith(
        expect.objectContaining({ dispatcher })
      );
    } finally {
      getDispatcher.mockRestore();
      continueDeployment.mockRestore();
    }
  });

  it('should mark a manual deployment as errored with `deploy continue --error`', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'static',
      id: 'static',
    });

    let body: any;
    let teamId: any;
    client.scenario.post(`/deployments/dpl_continue/continue`, (req, res) => {
      body = req.body;
      teamId = req.query.teamId;
      res.json({
        id: 'dpl_continue',
        url: 'continue.vercel.app',
        inspectorUrl: 'https://vercel.com/test/continue',
        readyState: 'ERROR',
        errorCode: 'BUILD_FAILED',
        errorMessage: body.errorMessage,
        aliasAssigned: false,
        alias: [],
      });
    });

    client.cwd = setupUnitFixture('commands/deploy/static');
    client.setArgv(
      'deploy',
      'continue',
      '--deployment',
      'dpl_continue',
      '--error',
      'External CI failed'
    );
    const exitCode = await deploy(client);
    expect(exitCode).toEqual(0);
    expect(body).toEqual({ errorMessage: 'External CI failed' });
    expect(teamId).toEqual('team_dummy');
    expect(client.stderr.getFullOutput()).not.toContain('deprecated');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:continue',
        value: 'continue',
      },
      {
        key: 'option:deployment',
        value: '[REDACTED]',
      },
    ]);
  });

  it('should mark a manual deployment as errored with `deploy continue --error=...`', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'static',
      id: 'static',
    });

    let body: any;
    client.scenario.post(`/deployments/dpl_continue/continue`, (req, res) => {
      body = req.body;
      res.json({
        id: 'dpl_continue',
        url: 'continue.vercel.app',
        readyState: 'ERROR',
        errorCode: 'BUILD_FAILED',
        errorMessage: body.errorMessage,
        aliasAssigned: false,
        alias: [],
      });
    });

    client.cwd = setupUnitFixture('commands/deploy/static');
    client.setArgv(
      'deploy',
      'continue',
      '--deployment',
      'dpl_continue',
      '--error=External CI failed'
    );
    const exitCode = await deploy(client);
    expect(exitCode).toEqual(0);
    expect(body).toEqual({ errorMessage: 'External CI failed' });
  });

  it('still accepts the deprecated `deploy continue --id` with a warning', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'static',
      id: 'static',
    });

    let body: any;
    client.scenario.post(`/deployments/dpl_continue/continue`, (req, res) => {
      body = req.body;
      res.json({
        id: 'dpl_continue',
        url: 'continue.vercel.app',
        readyState: 'ERROR',
        errorCode: 'BUILD_FAILED',
        errorMessage: body.errorMessage,
        aliasAssigned: false,
        alias: [],
      });
    });

    client.cwd = setupUnitFixture('commands/deploy/static');
    client.setArgv(
      'deploy',
      'continue',
      '--id',
      'dpl_continue',
      '--error',
      'External CI failed'
    );
    const exitCode = await deploy(client);
    expect(exitCode).toEqual(0);
    expect(body).toEqual({ errorMessage: 'External CI failed' });
    expect(client.stderr.getFullOutput()).toContain(
      '! --id is deprecated. Use --deployment.'
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:continue',
        value: 'continue',
      },
      {
        key: 'option:id',
        value: '[REDACTED]',
      },
    ]);
  });

  it('rejects `deploy continue` with both --deployment and --id before any request', async () => {
    const fetch = vi.spyOn(client, 'fetch');
    client.setArgv(
      'deploy',
      'continue',
      '--deployment',
      'dpl_a',
      '--id',
      'dpl_b'
    );
    expect(await deploy(client)).toEqual(2);
    expect(client.stderr.getFullOutput()).toContain(
      "Can't use --deployment with --id."
    );
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });

  it('rejects `deploy continue` with an empty --deployment before any request', async () => {
    const fetch = vi.spyOn(client, 'fetch');
    client.setArgv('deploy', 'continue', '--deployment=');
    expect(await deploy(client)).toEqual(2);
    expect(client.stderr.getFullOutput()).toContain(
      "--deployment can't be empty."
    );
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });

  it('keeps reporting an empty deprecated --id as missing_id', async () => {
    client.nonInteractive = true;
    client.setArgv('deploy', 'continue', '--id=');
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    expect(await deploy(client)).toEqual(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'missing_id',
    });
    vi.restoreAllMocks();
  });

  it('writes a JSON error for `deploy continue` with --deployment and --id in non-interactive mode', async () => {
    client.nonInteractive = true;
    client.setArgv(
      'deploy',
      'continue',
      '--deployment',
      'dpl_a',
      '--id',
      'dpl_b'
    );
    expect(await deploy(client)).toEqual(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      message: "Can't use --deployment with --id.",
    });
  });

  it('should pass flag to skip custom domain assignment', async () => {
    const user = useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'static',
      id: 'static',
    });

    let body: any;
    client.scenario.post(`/v13/deployments`, (req, res) => {
      body = req.body;
      res.json({
        creator: {
          uid: user.id,
          username: user.username,
        },
        id: 'dpl_archive_test',
      });
    });
    client.scenario.get(`/v13/deployments/dpl_archive_test`, (req, res) => {
      res.json({
        creator: {
          uid: user.id,
          username: user.username,
        },
        id: 'dpl_archive_test',
        readyState: 'READY',
        aliasAssigned: true,
        alias: [],
      });
    });

    client.cwd = setupUnitFixture('commands/deploy/static');
    client.setArgv('deploy', '--prod', '--skip-domain');
    const exitCode = await deploy(client);
    expect(exitCode).toEqual(0);
    expect(body).toMatchObject({
      target: 'production',
      source: 'cli',
      autoAssignCustomDomains: false,
      version: 2,
    });
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:prod', value: 'TRUE' },
      {
        key: 'flag:skip-domain',
        value: 'TRUE',
      },
      { key: 'target_environment', value: 'production' },
      { key: 'output:deployment-id', value: 'dpl_archive_test' },
    ]);
  });

  it('should upload missing files', async () => {
    const cwd = setupUnitFixture('commands/deploy/static');
    client.cwd = cwd;

    // Add random 1mb file
    await fs.writeFile(join(cwd, 'data'), randomBytes(bytes('1mb')));

    const user = useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'static',
      id: 'static',
    });

    let body: any;
    let fileUploaded = false;
    client.scenario.post(`/v13/deployments`, (req, res) => {
      if (fileUploaded) {
        body = req.body;
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: 'dpl_archive_test',
        });
      } else {
        const sha = req.body.files[0].sha;
        res.status(400).json({
          error: {
            code: 'missing_files',
            message: 'Missing files',
            missing: [sha],
          },
        });
      }
    });
    client.scenario.post('/v2/files', (req, res) => {
      // Wait for file to be finished uploading
      req.on('data', () => {
        // Noop
      });
      req.on('end', () => {
        fileUploaded = true;
        res.end();
      });
    });
    client.scenario.get(`/v13/deployments/dpl_archive_test`, (req, res) => {
      res.json({
        creator: {
          uid: user.id,
          username: user.username,
        },
        id: 'dpl_archive_test',
        readyState: 'READY',
        aliasAssigned: true,
        alias: [],
      });
    });
    client.scenario.get(`/v10/now/deployments/dpl_archive_test`, (req, res) => {
      res.json({
        creator: {
          uid: user.id,
          username: user.username,
        },
        id: 'dpl_archive_test',
        readyState: 'READY',
        aliasAssigned: true,
        alias: [],
      });
    });

    // When stderr is not a TTY we expect 5 progress lines to be printed
    client.stderr.isTTY = false;

    client.setArgv('deploy', '--archive=tgz');
    const uploadingLines: string[] = [];
    client.stderr.on('data', data => {
      if (data.startsWith('Uploading [')) {
        uploadingLines.push(data);
      }
    });
    client.stderr.resume();
    const exitCode = await deploy(client);
    expect(exitCode).toEqual(0);
    expect(body?.files?.length).toEqual(1);
    expect(body?.files?.[0].file).toEqual('.vercel/source.tgz.part1');
    expect(uploadingLines.length).toEqual(5);
    expect(
      uploadingLines[0].startsWith('Uploading [--------------------]')
    ).toEqual(true);
    expect(
      uploadingLines[1].startsWith('Uploading [=====---------------]')
    ).toEqual(true);
    expect(
      uploadingLines[2].startsWith('Uploading [==========----------]')
    ).toEqual(true);
    expect(
      uploadingLines[3].startsWith('Uploading [===============-----]')
    ).toEqual(true);
    expect(
      uploadingLines[4].startsWith('Uploading [====================]')
    ).toEqual(true);
  });

  it('should keep passing teamId for normal linked team deploys', async () => {
    const originalVercelTeamId = process.env.VERCEL_TEAM_ID;
    delete process.env.VERCEL_TEAM_ID;

    try {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
      });

      let createTeamId: unknown;
      client.scenario.post(`/v13/deployments`, (req, res) => {
        createTeamId = req.query.teamId;
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: 'dpl_normal_team',
          url: 'normal-team.vercel.app',
          readyState: 'READY',
          aliasAssigned: true,
          alias: [],
          target: 'preview',
        });
      });

      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy');
      const exitCode = await deploy(client);

      expect(exitCode).toEqual(0);
      expect(createTeamId).toEqual('team_dummy');
    } finally {
      if (originalVercelTeamId === undefined) {
        delete process.env.VERCEL_TEAM_ID;
      } else {
        process.env.VERCEL_TEAM_ID = originalVercelTeamId;
      }
    }
  });

  describe('linked deployment authentication', () => {
    let deploymentTokens: (string | undefined)[];

    beforeEach(async () => {
      const cwd = setupUnitFixture('commands/deploy/static');
      await fs.writeJSON(join(cwd, '.vercel/project.json'), {
        orgId: 'team_dummy',
        projectId: 'prj_static',
        projectName: 'static',
      });
      client.cwd = cwd;
      deploymentTokens = [];

      // Exercise the real refresh logic without using saved credentials or
      // writing the developer's global config.
      vi.spyOn(client, 'persistAuthConfig').mockImplementation(() => {});
      vi.spyOn(client, 'writeToConfigFile').mockImplementation(() => {});
      vi.spyOn(oauth, 'refreshTokenRequest').mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            access_token: 'refreshed_access_token',
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: 'rotated_refresh_token',
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      });

      client.scenario.get('/v9/projects/prj_static', (_req, res) => {
        res.json({
          ...defaultProject,
          accountId: 'team_dummy',
          id: 'prj_static',
          name: 'static',
        });
      });
      client.scenario.post('/v13/deployments', (req, res) => {
        deploymentTokens.push(req.headers.authorization);
        res.json({
          creator: { uid: 'user_dummy', username: 'user_dummy' },
          id: 'dpl_refreshed_token',
          url: 'refreshed-token.vercel.app',
          readyState: 'READY',
          aliasAssigned: true,
          alias: [],
          target: 'preview',
        });
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it.each([
      false,
      true,
    ])('refreshes an expired token before deployment creation (noWait=%s)', async noWait => {
      client.authConfig = {
        ...client.authConfig,
        token: 'expired_access_token',
        refreshToken: 'saved_refresh_token',
        expiresAt: 0,
      };
      client.setArgv('deploy', ...(noWait ? ['--no-wait'] : []));

      expect(await deploy(client)).toBe(0);
      expect(deploymentTokens).toEqual(['Bearer refreshed_access_token']);
      expect(oauth.refreshTokenRequest).toHaveBeenCalledExactlyOnceWith({
        refresh_token: 'saved_refresh_token',
      });
      expect(client.authConfig).toMatchObject({
        token: 'refreshed_access_token',
        refreshToken: 'rotated_refresh_token',
      });
      expect(client.persistAuthConfig).toHaveBeenCalledOnce();
      expect(client.stdout.getFullOutput()).not.toContain('access_token');
      expect(client.stderr.getFullOutput()).not.toContain('access_token');
    });

    it.each([
      3600,
      undefined,
    ])('does not refresh a usable token (expiresIn=%s)', async expiresIn => {
      client.authConfig = {
        ...client.authConfig,
        expiresAt:
          expiresIn === undefined
            ? undefined
            : Math.floor(Date.now() / 1000) + expiresIn,
      };
      client.setArgv('deploy');

      expect(await deploy(client)).toBe(0);
      expect(deploymentTokens).toEqual(['Bearer token_dummy']);
      expect(oauth.refreshTokenRequest).not.toHaveBeenCalled();
      expect(client.persistAuthConfig).not.toHaveBeenCalled();
    });

    it.each([
      'flag',
      'env',
    ] as const)('uses an explicit %s token without refreshing', async tokenSource => {
      client.authConfig = {
        token: 'explicit_access_token',
        tokenSource,
        skipWrite: true,
      };
      client.setArgv('deploy', '--no-wait');

      expect(await deploy(client)).toBe(0);
      expect(deploymentTokens).toEqual(['Bearer explicit_access_token']);
      expect(oauth.refreshTokenRequest).not.toHaveBeenCalled();
      expect(client.persistAuthConfig).not.toHaveBeenCalled();
    });

    it('does not create a deployment when an expired login has no refresh token', async () => {
      client.authConfig = {
        ...client.authConfig,
        expiresAt: 0,
      };
      client.setArgv('deploy');

      expect(await deploy(client)).toBe(1);
      expect(deploymentTokens).toEqual([]);
      expect(oauth.refreshTokenRequest).not.toHaveBeenCalled();
      expect(client.authConfig.token).toBeUndefined();
      expect(client.stderr.getFullOutput()).toContain(
        'Missing authentication token'
      );
    });

    it('does not create a deployment when the refresh request throws', async () => {
      client.authConfig = {
        ...client.authConfig,
        token: 'expired_access_token',
        refreshToken: 'saved_refresh_token',
        expiresAt: 0,
      };
      vi.mocked(oauth.refreshTokenRequest).mockRejectedValueOnce(
        new Error('Token refresh connection failed')
      );
      client.setArgv('deploy');

      expect(await deploy(client)).toBe(1);
      expect(deploymentTokens).toEqual([]);
      expect(oauth.refreshTokenRequest).toHaveBeenCalledOnce();
      expect(client.stderr.getFullOutput()).toContain(
        'Token refresh connection failed'
      );
    });

    it('does not create a deployment when a non-interactive refresh fails', async () => {
      client.authConfig = {
        ...client.authConfig,
        token: 'expired_access_token',
        refreshToken: 'invalid_refresh_token',
        expiresAt: 0,
      };
      vi.mocked(oauth.refreshTokenRequest).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 'invalid_grant',
            error_description: 'Refresh token is invalid.',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      );
      client.nonInteractive = true;
      client.setArgv('deploy', '--non-interactive', '--no-wait');

      expect(await deploy(client)).toBe(1);
      expect(deploymentTokens).toEqual([]);
      expect(client.authConfig.token).toBeUndefined();
      expect(oauth.refreshTokenRequest).toHaveBeenCalledOnce();
      expect(client.stderr.getFullOutput()).not.toContain(
        'Starting a new login'
      );
      expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
        status: 'error',
        reason: 'deploy_failed',
        message: 'Missing authentication token',
      });
    });
  });

  it('starts a linked project lookup without delaying deployment creation', async () => {
    const cwd = setupUnitFixture('commands/deploy/static');
    await fs.writeJSON(join(cwd, '.vercel/project.json'), {
      orgId: 'team_dummy',
      projectId: 'prj_static',
      projectName: 'static',
    });

    let startProjectLookup!: () => void;
    const projectLookupStarted = new Promise<void>(resolve => {
      startProjectLookup = resolve;
    });
    let finishProjectLookup!: () => void;
    const projectLookupFinished = new Promise<void>(resolve => {
      finishProjectLookup = resolve;
    });
    client.scenario.get(`/v9/projects/prj_static`, async (_req, res) => {
      startProjectLookup();
      await projectLookupFinished;
      res.json({
        ...defaultProject,
        accountId: 'team_dummy',
        id: 'prj_static',
        name: 'static',
        rollingRelease: {
          enabled: true,
          advancementType: 'automatic',
        },
      });
    });

    let startDeploymentRequest!: () => void;
    const deploymentRequestStarted = new Promise<void>(resolve => {
      startDeploymentRequest = resolve;
    });
    let createTeamId: unknown;
    let createBody: Record<string, unknown> | undefined;
    client.scenario.post(`/v13/deployments`, (req, res) => {
      startDeploymentRequest();
      createTeamId = req.query.teamId;
      createBody = req.body;
      res.json({
        creator: {
          uid: 'user_dummy',
          username: 'user_dummy',
        },
        id: 'dpl_local_link',
        url: 'local-link.vercel.app',
        readyState: 'READY',
        aliasAssigned: true,
        alias: [],
        target: 'preview',
      });
    });

    client.cwd = cwd;
    client.setArgv('deploy');

    const originalVercelTeamId = process.env.VERCEL_TEAM_ID;
    delete process.env.VERCEL_TEAM_ID;
    let exitCode: number;
    try {
      const exitCodePromise = deploy(client);

      await Promise.all([projectLookupStarted, deploymentRequestStarted]);
      finishProjectLookup();
      exitCode = await exitCodePromise;
    } finally {
      if (originalVercelTeamId === undefined) {
        delete process.env.VERCEL_TEAM_ID;
      } else {
        process.env.VERCEL_TEAM_ID = originalVercelTeamId;
      }
    }

    expect(exitCode).toEqual(0);
    expect(createTeamId).toEqual('team_dummy');
    expect(createBody?.project).toEqual('prj_static');
    expect(client.stderr.getFullOutput()).toContain('Deploying static');
    expect(client.stderr.getFullOutput()).not.toContain('team_dummy/static');
    expect(client.stderr.getFullOutput()).toContain('Releasing');
  });

  it('surfaces deployment authorization errors when using local project metadata', async () => {
    const cwd = setupUnitFixture('commands/deploy/static');
    await fs.writeJSON(join(cwd, '.vercel/project.json'), {
      orgId: 'team_dummy',
      projectId: 'prj_static',
      projectName: 'static',
    });
    client.scenario.get(`/v9/projects/prj_static`, (_req, res) => {
      res.json({
        ...defaultProject,
        accountId: 'team_dummy',
        id: 'prj_static',
        name: 'static',
      });
    });
    client.scenario.post(`/v13/deployments`, (_req, res) => {
      res.status(403).json({
        error: {
          code: 'forbidden',
          message: 'Not authorized to deploy this project.',
        },
      });
    });

    client.cwd = cwd;
    client.setArgv('deploy');
    const exitCodePromise = deploy(client);

    await expect(client.stderr).toOutput(
      'Error: Not authorized to deploy this project.\n'
    );
    expect(await exitCodePromise).toEqual(1);
  });

  it('does not send a repo root mapping as the Project rootDirectory', async () => {
    const cwd = setupUnitFixture('commands/deploy/static');
    await fs.remove(join(cwd, '.vercel'));
    await fs.outputJSON(join(cwd, '.vercel/repo.json'), {
      remoteName: 'origin',
      projects: [
        {
          id: 'prj_static',
          name: 'static',
          orgId: 'team_dummy',
          directory: '.',
        },
      ],
    });

    const user = useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      accountId: 'team_dummy',
      id: 'prj_static',
      name: 'static',
      rootDirectory: null,
    });

    let createBody: Record<string, unknown> | undefined;
    client.scenario.post(`/v13/deployments`, (req, res) => {
      createBody = req.body;
      res.json({
        creator: {
          uid: user.id,
          username: user.username,
        },
        id: 'dpl_local_link',
        url: 'local-link.vercel.app',
        readyState: 'READY',
        aliasAssigned: true,
        alias: [],
        target: 'preview',
      });
    });

    client.cwd = cwd;
    client.setArgv('deploy');
    const exitCode = await deploy(client);

    expect(exitCode).toEqual(0);
    expect(createBody?.projectSettings).toMatchObject({
      rootDirectory: null,
      sourceFilesOutsideRootDirectory: true,
    });
  });

  it('should deploy a linked project when owner lookup is unavailable', async () => {
    const originalVercelTeamId = process.env.VERCEL_TEAM_ID;
    delete process.env.VERCEL_TEAM_ID;

    try {
      useTeams('team_dummy', { failNoAccess: true });
      client.config.currentTeam = 'team_dummy';

      const projectLookupTeamIds: unknown[] = [];
      client.scenario.get(`/v9/projects/static`, (req, res) => {
        projectLookupTeamIds.push(req.query.teamId);
        res.json({
          ...defaultProject,
          accountId: 'team_dummy',
          name: 'static',
          id: 'static',
        });
      });

      let createTeamId: unknown;
      const statusTeamIds: unknown[] = [];
      client.scenario.post(`/v13/deployments`, (req, res) => {
        createTeamId = req.query.teamId;
        res.json({
          creator: {
            uid: 'user_dummy',
            username: 'user_dummy',
          },
          id: 'dpl_scoped_token',
          url: 'scoped-token.vercel.app',
          readyState: 'BUILDING',
          aliasAssigned: false,
          alias: [],
          target: 'preview',
        });
      });
      client.scenario.get(`/v13/deployments/dpl_scoped_token`, (req, res) => {
        statusTeamIds.push(req.query.teamId);
        res.json({
          creator: {
            uid: 'user_dummy',
            username: 'user_dummy',
          },
          id: 'dpl_scoped_token',
          url: 'scoped-token.vercel.app',
          readyState: 'READY',
          aliasAssigned: true,
          alias: [],
          target: 'preview',
        });
      });
      let eventsConnectionClosed = false;
      client.scenario.get(
        `/v3/now/deployments/dpl_scoped_token/events`,
        (req, res) => {
          req.on('close', () => {
            eventsConnectionClosed = true;
          });
          res.end();
        }
      );

      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy');
      const exitCode = await deploy(client);

      expect(exitCode).toEqual(0);
      // The second lookup reads Deployment Protection settings after deploy.
      expect(projectLookupTeamIds).toEqual(['team_dummy', 'team_dummy']);
      expect(createTeamId).toBeUndefined();
      expect(statusTeamIds).toEqual([undefined]);
      expect(client.config.currentTeam).toBeUndefined();

      await vi.waitFor(() => expect(eventsConnectionClosed).toBe(true));
    } finally {
      if (originalVercelTeamId === undefined) {
        delete process.env.VERCEL_TEAM_ID;
      } else {
        process.env.VERCEL_TEAM_ID = originalVercelTeamId;
      }
    }
  });

  it('should deploy project linked with `repo.json`', async () => {
    const user = useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'app',
      id: 'QmbKpqpiUqbcke',
    });

    let body: any;
    client.scenario.post(`/v13/deployments`, (req, res) => {
      body = req.body;
      res.json({
        creator: {
          uid: user.id,
          username: user.username,
        },
        id: 'dpl_archive_test',
      });
    });
    client.scenario.get(`/v13/deployments/dpl_archive_test`, (req, res) => {
      res.json({
        creator: {
          uid: user.id,
          username: user.username,
        },
        id: 'dpl_archive_test',
        readyState: 'READY',
        aliasAssigned: true,
        alias: [],
      });
    });

    const repoRoot = setupUnitFixture('commands/deploy/monorepo-static');
    client.cwd = join(repoRoot, 'app');
    client.setArgv('deploy');
    const exitCode = await deploy(client);
    expect(exitCode).toEqual(0);
    expect(body).toMatchObject({
      source: 'cli',
      version: 2,
    });
  });

  it('should inspect the repository root for a dry run linked with `repo.json`', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'app',
      id: 'QmbKpqpiUqbcke',
      rootDirectory: 'app',
      framework: 'nextjs',
    });

    const repoRoot = setupUnitFixture('commands/deploy/monorepo-static');
    client.cwd = join(repoRoot, 'app');
    client.setArgv('deploy', '--dry', '--format=json');
    const exitCode = await deploy(client);
    const payload = JSON.parse(client.stdout.getFullOutput());

    expect(exitCode).toEqual(0);
    expect(payload.basePath).toEqual(repoRoot);
    expect(payload.framework).toEqual({
      name: 'Next.js',
      slug: 'nextjs',
    });
    expect(payload.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'app/index.html' }),
        expect.objectContaining({ path: 'app/style.css' }),
      ])
    );
  });

  it('should inspect linked monorepo prebuilt output from the project root directory', async () => {
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'app',
      id: 'QmbKpqpiUqbcke',
      rootDirectory: 'app',
      framework: 'nextjs',
    });

    const repoRoot = setupUnitFixture('commands/deploy/monorepo-static');
    const outputDirectory = join(repoRoot, 'app/.vercel/output');
    await fs.outputFile(
      join(outputDirectory, 'builds.json'),
      JSON.stringify({ target: 'preview', builds: [] })
    );
    await fs.outputFile(
      join(outputDirectory, 'config.json'),
      JSON.stringify({ version: 3 })
    );
    await fs.outputFile(
      join(outputDirectory, 'static/index.html'),
      '<h1>Hello</h1>'
    );

    client.cwd = join(repoRoot, 'app');
    client.setArgv('deploy', '--prebuilt', '--dry', '--format=json');
    const exitCode = await deploy(client);
    const payload = JSON.parse(client.stdout.getFullOutput());

    expect(exitCode).toEqual(0);
    expect(payload.basePath).toEqual(repoRoot);
    expect(payload.framework).toEqual({
      name: 'Next.js',
      slug: 'nextjs',
    });
    expect(payload.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'app/.vercel/output/static/index.html',
        }),
      ])
    );
  });

  it('should send `projectSettings.nodeVersion` based on `engines.node` package.json field', async () => {
    const user = useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'node',
      id: 'QmbKpqpiUqbcke',
    });

    let body: any;
    client.scenario.post(`/v13/deployments`, (req, res) => {
      body = req.body;
      res.json({
        creator: {
          uid: user.id,
          username: user.username,
        },
        id: 'dpl_',
      });
    });
    client.scenario.get(`/v13/deployments/dpl_`, (req, res) => {
      res.json({
        creator: {
          uid: user.id,
          username: user.username,
        },
        id: 'dpl_',
        readyState: 'READY',
        aliasAssigned: true,
        alias: [],
      });
    });

    const repoRoot = setupUnitFixture('commands/deploy/node');
    client.cwd = repoRoot;
    client.setArgv('deploy');
    const exitCode = await deploy(client);
    expect(exitCode).toEqual(0);
    expect(body).toMatchObject({
      source: 'cli',
      version: 2,
      projectSettings: {
        nodeVersion: '24.x',
        sourceFilesOutsideRootDirectory: true,
      },
    });
  });

  it('should send `projectSettings.nodeVersion` based on `engines.node` package.json field with `builds` in `vercel.json`', async () => {
    const user = useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'legacy-builds',
      id: 'QmbKpqpiUqbcke',
    });

    let body: any;
    client.scenario.post(`/v13/deployments`, (req, res) => {
      body = req.body;
      res.json({
        creator: {
          uid: user.id,
          username: user.username,
        },
        id: 'dpl_',
      });
    });
    client.scenario.get(`/v13/deployments/dpl_`, (req, res) => {
      res.json({
        creator: {
          uid: user.id,
          username: user.username,
        },
        id: 'dpl_',
        readyState: 'READY',
        aliasAssigned: true,
        alias: [],
      });
    });

    const repoRoot = setupUnitFixture('commands/deploy/legacy-builds');
    client.cwd = repoRoot;
    client.setArgv('deploy');
    const exitCode = await deploy(client);
    expect(exitCode).toEqual(0);
    expect(body).toMatchObject({
      source: 'cli',
      version: 2,
      projectSettings: {
        nodeVersion: '24.x',
        sourceFilesOutsideRootDirectory: true,
      },
    });
  });

  it('should send latest supported node version when given a >low-node-version based on `engines.node` package.json field', async () => {
    const user = useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'node-low-starting-range',
      id: 'QmbKpqpiUqbcke',
    });

    let body: any;
    client.scenario.post(`/v13/deployments`, (req, res) => {
      body = req.body;
      res.json({
        creator: {
          uid: user.id,
          username: user.username,
        },
        id: 'dpl_',
      });
    });
    client.scenario.get(`/v13/deployments/dpl_`, (req, res) => {
      res.json({
        creator: {
          uid: user.id,
          username: user.username,
        },
        id: 'dpl_',
        readyState: 'READY',
        aliasAssigned: true,
        alias: [],
      });
    });

    const repoRoot = setupUnitFixture(
      'commands/deploy/node-low-starting-range'
    );
    client.cwd = repoRoot;
    client.setArgv('deploy');
    const exitCode = await deploy(client);
    expect(exitCode).toEqual(0);
    expect(body).toMatchObject({
      source: 'cli',
      version: 2,
      projectSettings: {
        nodeVersion: '24.x',
        sourceFilesOutsideRootDirectory: true,
      },
    });
  });

  it('should send no version when `engines.node` package.json field is fixed to an outdated version', async () => {
    const user = useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      name: 'node-low-version',
      id: 'QmbKpqpiUqbcke',
    });

    let body: any;
    client.scenario.post(`/v13/deployments`, (req, res) => {
      body = req.body;
      res.json({
        creator: {
          uid: user.id,
          username: user.username,
        },
        id: 'dpl_',
      });
    });
    client.scenario.get(`/v13/deployments/dpl_`, (req, res) => {
      res.json({
        creator: {
          uid: user.id,
          username: user.username,
        },
        id: 'dpl_',
        readyState: 'READY',
        aliasAssigned: true,
        alias: [],
      });
    });

    const repoRoot = setupUnitFixture('commands/deploy/node-low-version');
    client.cwd = repoRoot;
    client.setArgv('deploy');
    const exitCodePromise = deploy(client);
    await expect(client.stderr).toOutput(
      'WARNING! Node.js Version "10.x" is discontinued and must be upgraded. Please set "engines": { "node": "24.x" } in your `package.json` file to use Node.js 24.'
    );
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "deploy"').toEqual(0);
    expect(body).toMatchObject({
      source: 'cli',
      version: 2,
      projectSettings: {
        sourceFilesOutsideRootDirectory: true,
      },
    });
  });

  describe('build logs', () => {
    let deployment: ReturnType<typeof useDeployment>;

    const outputLine1 = 'Hello, world!';
    const outputLine2 = 'slow...';
    const outputLine3 = 'Bye...';
    const slowlyDeploy = async () => {
      await sleep(500);
      deployment.readyState = 'READY';
      deployment.aliasAssigned = true;
    };

    beforeEach(() => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'node',
        id: 'QmbKpqpiUqbcke',
      });
      deployment = useDeployment({ creator: user, state: 'BUILDING' });
      deployment.aliasAssigned = false;
      client.scenario.post(`/v13/deployments`, (req, res) => {
        res.json(
          res.json({
            creator: {
              uid: user.id,
              username: user.username,
            },
            id: deployment.id,
            readyState: deployment.readyState,
            aliasAssigned: false,
            alias: [],
          })
        );
      });
      client.scenario.get(`/v9/projects/:id`, (_req, res) => {
        res.json({
          ...defaultProject,
          name: 'node',
          id: 'QmbKpqpiUqbcke',
        });
      });
      useBuildLogs({
        deployment,
        logProducer: async function* () {
          yield { created: 1717426870339, text: 'Hello, world!' };
          await sleep(100);
          yield { created: 1717426870439, text: 'slow...' };
          await sleep(100);
          yield { created: 1717426870540, text: 'Bye...' };
        },
      });
    });

    it('should print and follow build logs while deploying with --logs', async () => {
      let exitCode: number | undefined;
      const runCommand = async () => {
        const repoRoot = setupUnitFixture('commands/deploy/node');
        client.cwd = repoRoot;
        client.setArgv('deploy', '--logs');
        exitCode = await deploy(client);
      };

      const slowlyDeploy = async () => {
        await sleep(500);
        deployment.readyState = 'READY';
        deployment.aliasAssigned = true;
      };

      await Promise.all<void>([runCommand(), slowlyDeploy()]);

      const outputLines = client.getFullOutput().split('\n');

      // remove first 3 lines which contain warning and randomized data
      const output = outputLines.slice(3).join('\n');
      expect(output).toContain('Building');
      expect(output).toContain(`2024-06-03T15:01:10.339Z  ${outputLine1}`);
      expect(output).toContain(`2024-06-03T15:01:10.439Z  ${outputLine2}`);
      expect(output).toContain(`2024-06-03T15:01:10.540Z  ${outputLine3}`);
      expect(exitCode).toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:logs',
          value: 'TRUE',
        },
        { key: 'target_environment', value: 'preview' },
        { key: 'output:deployment-id', value: expect.any(String) },
      ]);
    });

    it('should not print and follow build logs while deploying by default', async () => {
      let exitCode: number | undefined;
      const runCommand = async () => {
        const repoRoot = setupUnitFixture('commands/deploy/node');
        client.cwd = repoRoot;
        client.setArgv('deploy');
        exitCode = await deploy(client);
      };

      await Promise.all<void>([runCommand(), slowlyDeploy()]);

      // remove first 3 lines which contains randomized data
      const output = client.getFullOutput().split('\n').slice(3).join('\n');
      expect(output).toContain('Building');
      expect(output).toContain('Production      https');
      expect(output).toContain('Completing');
      expect(exitCode).toEqual(0);
    });
  });

  describe('calls createDeploy with the appropriate arguments', () => {
    let mock: MockInstance;
    beforeEach(() => {
      mock = vi.spyOn(createDeployModule, 'default');
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
      });

      client.scenario.post(`/v13/deployments`, (req, res) => {
        process.stderr.write('itme');
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: 'dpl_archive_test',
          // FIXME: this is needed for the no-wait assertion, but doesn't seem like an accurate representation
          readyState: 'READY',
        });
      });
      client.scenario.get(`/v13/deployments/dpl_archive_test`, (req, res) => {
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: 'dpl_archive_test',
          readyState: 'READY',
          aliasAssigned: true,
          alias: [],
        });
      });
    });

    const baseCreateDeployArgs = {
      client,
      now: expect.anything(),
      contextName: expect.any(String),
      path: expect.any(String),
      createArgs: expect.any(Object),
      org: expect.any(Object),
      isSettingUpProject: expect.any(Boolean),
      archive: undefined,
    };

    it('--force', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--force');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          createArgs: expect.objectContaining({ forceNew: true }),
        })
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:force', value: 'TRUE' },
        { key: 'target_environment', value: 'preview' },
        { key: 'output:deployment-id', value: 'dpl_archive_test' },
      ]);
    });
    it('--with-cache', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--with-cache');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          createArgs: expect.objectContaining({ withCache: true }),
        })
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:with-cache', value: 'TRUE' },
        { key: 'target_environment', value: 'preview' },
        { key: 'output:deployment-id', value: 'dpl_archive_test' },
      ]);
    });
    it('--turbo', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--turbo');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          createArgs: expect.objectContaining({ buildMachine: 'turbo' }),
        })
      );
    });
    it('--env', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--env', 'KEY1=value', '--env', 'KEY2=value2');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          createArgs: expect.objectContaining({
            env: { KEY1: 'value', KEY2: 'value2' },
          }),
        })
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:env', value: '[REDACTED]' },
        { key: 'target_environment', value: 'preview' },
        { key: 'output:deployment-id', value: 'dpl_archive_test' },
      ]);
    });
    it('--build-env', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv(
        'deploy',
        '--build-env',
        'KEY1=value',
        '--build-env',
        'KEY2=value2'
      );
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          createArgs: expect.objectContaining({
            build: { env: { KEY1: 'value', KEY2: 'value2' } },
          }),
        })
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:build-env', value: '[REDACTED]' },
        { key: 'target_environment', value: 'preview' },
        { key: 'output:deployment-id', value: 'dpl_archive_test' },
      ]);
    });
    it('--meta', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--meta', 'KEY1=value', '--meta', 'KEY2=value2');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          createArgs: expect.objectContaining({
            meta: { KEY1: 'value', KEY2: 'value2' },
          }),
        })
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:meta', value: '[REDACTED]' },
        { key: 'target_environment', value: 'preview' },
        { key: 'output:deployment-id', value: 'dpl_archive_test' },
      ]);
    });
    it('--regions', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--regions', 'us-east-1,us-east-2');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          createArgs: expect.objectContaining({
            regions: ['us-east-1', 'us-east-2'],
          }),
        })
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:regions', value: '[REDACTED]' },
        { key: 'target_environment', value: 'preview' },
        { key: 'output:deployment-id', value: 'dpl_archive_test' },
      ]);
    });
    it('--prebuilt', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static-with-build-output');
      client.setArgv('deploy', '--prebuilt');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          createArgs: expect.objectContaining({
            vercelOutputDir: expect.any(String),
            prebuilt: true,
          }),
        })
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:prebuilt', value: 'TRUE' },
        { key: 'target_environment', value: 'preview' },
        { key: 'output:deployment-id', value: 'dpl_archive_test' },
      ]);
    });
    it('--archive=tgz', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--archive=tgz');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          archive: 'tgz',
        })
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:archive', value: 'tgz' },
        { key: 'target_environment', value: 'preview' },
        { key: 'output:deployment-id', value: 'dpl_archive_test' },
      ]);
    });
    it('--archive=split-tgz', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--archive=split-tgz');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          archive: 'tgz',
        })
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:archive', value: 'split-tgz' },
        { key: 'target_environment', value: 'preview' },
        { key: 'output:deployment-id', value: 'dpl_archive_test' },
      ]);
    });
    it('--no-wait', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--no-wait');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          createArgs: expect.objectContaining({
            noWait: true,
          }),
        })
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:no-wait', value: 'TRUE' },
        { key: 'target_environment', value: 'preview' },
        { key: 'output:deployment-id', value: 'dpl_archive_test' },
      ]);
    });
    it('--skip-domain without --prod should error', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--skip-domain');
      const exitCodePromise = deploy(client);
      await expect(client.stderr).toOutput(
        'Error: The `--skip-domain` option can only be used with production deployments. Use `--prod` or `--environment production`.'
      );
      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(1);
    });
    it('--skip-domain with --target=custom-env should error', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--skip-domain', '--target', 'my-custom-env');
      const exitCodePromise = deploy(client);
      await expect(client.stderr).toOutput(
        'Error: The `--skip-domain` option can only be used with production deployments. Use `--prod` or `--environment production`.'
      );
      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(1);
    });
    it('--skip-domain with --prod', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--skip-domain', '--prod');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          createArgs: expect.objectContaining({
            autoAssignCustomDomains: false,
            target: 'production',
          }),
        })
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:prod', value: 'TRUE' },
        { key: 'flag:skip-domain', value: 'TRUE' },
        { key: 'target_environment', value: 'production' },
        { key: 'output:deployment-id', value: 'dpl_archive_test' },
      ]);
    });
    it('--skip-domain with --target=production', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--skip-domain', '--target', 'production');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          createArgs: expect.objectContaining({
            autoAssignCustomDomains: false,
            target: 'production',
          }),
        })
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:target', value: 'production' },
        { key: 'flag:skip-domain', value: 'TRUE' },
        { key: 'target_environment', value: 'production' },
        { key: 'output:deployment-id', value: 'dpl_archive_test' },
      ]);
    });
    it('--yes', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--yes');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          createArgs: expect.objectContaining({
            skipAutoDetectionConfirmation: true,
          }),
        })
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:yes', value: 'TRUE' },
        { key: 'target_environment', value: 'preview' },
        { key: 'output:deployment-id', value: 'dpl_archive_test' },
      ]);
    });
    it('--logs', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--logs');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          createArgs: expect.objectContaining({
            withFullLogs: true,
          }),
        })
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:logs', value: 'TRUE' },
        { key: 'target_environment', value: 'preview' },
        { key: 'output:deployment-id', value: 'dpl_archive_test' },
      ]);
    });
    it('--guidance', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--guidance');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(client.stderr.getFullOutput()).toContain('Next steps:');

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:guidance', value: 'TRUE' },
        { key: 'target_environment', value: 'preview' },
        { key: 'output:deployment-id', value: 'dpl_archive_test' },
      ]);
    });
    it('shows post-deploy guidance by default', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(client.stderr.getFullOutput()).toContain('Next steps:');
    });
    it('respects disabled guidance settings', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.config.guidance = { enabled: false };
      client.setArgv('deploy');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(client.stderr.getFullOutput()).not.toContain('Next steps:');
    });
    it('--name', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--name', 'okok');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:name', value: '[REDACTED]' },
        { key: 'target_environment', value: 'preview' },
        { key: 'output:deployment-id', value: 'dpl_archive_test' },
      ]);
    });
    it('--no-clipboard', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--no-clipboard');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:no-clipboard', value: 'TRUE' },
        { key: 'target_environment', value: 'preview' },
        { key: 'output:deployment-id', value: 'dpl_archive_test' },
      ]);
    });
    it('--target=preview', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--target', 'preview');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          createArgs: expect.objectContaining({
            target: 'preview',
          }),
        })
      );

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:target',
          value: 'preview',
        },
        { key: 'target_environment', value: 'preview' },
        { key: 'output:deployment-id', value: 'dpl_archive_test' },
      ]);
    });
    it('--target=production', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--target', 'production');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          createArgs: expect.objectContaining({
            target: 'production',
          }),
        })
      );

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:target',
          value: 'production',
        },
        { key: 'target_environment', value: 'production' },
        { key: 'output:deployment-id', value: 'dpl_archive_test' },
      ]);
    });
    it.each([
      [['--environment', 'preview'], 'preview'],
      [['--environment=production'], 'production'],
      [['--environment', 'my-custom-env-slug'], 'my-custom-env-slug'],
    ])('--environment %j', async (args, target) => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', ...args);
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          createArgs: expect.objectContaining({ target }),
        })
      );
      expect(client.stderr.getFullOutput()).not.toContain('deprecated');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:environment',
          value: target === 'my-custom-env-slug' ? '[REDACTED]' : target,
        },
        {
          key: 'target_environment',
          value: target === 'production' ? 'production' : 'preview',
        },
        { key: 'output:deployment-id', value: 'dpl_archive_test' },
      ]);
    });
    it('--target keeps working with a deprecation warning', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--target', 'preview');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);
      expect(client.stderr.getFullOutput()).toContain(
        '--target is deprecated. Use --environment.'
      );
    });
    it('--target with --prod names the flag the user typed', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--target', 'preview', '--prod');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          createArgs: expect.objectContaining({ target: 'preview' }),
        })
      );
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain(
        '! Ignoring --prod because --target is also set. Pass only one of them.'
      );
      expect(stderr).not.toContain('WARNING!');
    });
    it('--target with --environment is a usage error', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      const createDeployCalls = mock.mock.calls.length;
      client.setArgv(
        'deploy',
        '--target',
        'preview',
        '--environment',
        'production'
      );
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(2);
      expect(mock.mock.calls.length).toEqual(createDeployCalls);
      expect(client.stderr.getFullOutput()).toContain(
        "Can't use --target with --environment. Use --environment."
      );
    });
    it.each([
      ['-e', '--env', { env: { KEY1: 'value' } }],
      ['-b', '--build-env', { build: { env: { KEY1: 'value' } } }],
    ])('%s keeps working with a deprecation warning', async (short, long, createArgs) => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', short, 'KEY1=value');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          createArgs: expect.objectContaining(createArgs),
        })
      );
      expect(client.stderr.getFullOutput()).toContain(
        `${short} is deprecated. Use ${long}.`
      );
    });
    it('keeps the order of mixed -e and --env values', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '-e', 'KEY1=first', '--env', 'KEY1=second');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          createArgs: expect.objectContaining({ env: { KEY1: 'second' } }),
        })
      );
    });
    it('--env and --build-env do not warn', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv(
        'deploy',
        '--env',
        'KEY1=value',
        '--build-env',
        'KEY2=value'
      );
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);
      expect(client.stderr.getFullOutput()).not.toContain('deprecated');
    });
    it('--target=my-custom-env-slug', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--target', 'my-custom-env-slug');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          createArgs: expect.objectContaining({
            target: 'my-custom-env-slug',
          }),
        })
      );

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:target',
          value: '[REDACTED]',
        },
        { key: 'target_environment', value: 'preview' },
        { key: 'output:deployment-id', value: 'dpl_archive_test' },
      ]);
    });
    it('--prod', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--prod');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          createArgs: expect.objectContaining({
            target: 'production',
          }),
        })
      );

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:prod',
          value: 'TRUE',
        },
        { key: 'target_environment', value: 'production' },
        { key: 'output:deployment-id', value: 'dpl_archive_test' },
      ]);
    });
    it('--prod with --non-interactive', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      (client as { nonInteractive: boolean }).nonInteractive = true;
      client.setArgv('deploy', '--prod', '--non-interactive');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          createArgs: expect.objectContaining({
            target: 'production',
          }),
        })
      );

      const stdoutOutput = client.stdout.getFullOutput().trim();
      const payload = JSON.parse(stdoutOutput);
      expect(payload).toMatchObject({
        status: 'ok',
        deployment: expect.objectContaining({
          id: expect.any(String),
          readyState: expect.any(String),
        }),
      });
      (client as { nonInteractive: boolean }).nonInteractive = false;
    });
    it('passes agentName from client', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.agentName = 'test-agent';
      client.setArgv('deploy');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(mock).toHaveBeenCalledWith(
        ...Object.values({
          ...baseCreateDeployArgs,
          createArgs: expect.objectContaining({
            agentName: 'test-agent',
          }),
        })
      );
    });
    it('--confirm', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--confirm');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:confirm',
          value: 'TRUE',
        },
        { key: 'target_environment', value: 'preview' },
        { key: 'output:deployment-id', value: 'dpl_archive_test' },
      ]);
      expect(client.telemetryEventStore).not.toHaveTelemetryEvents([
        {
          key: 'flag:yes',
          value: 'TRUE',
        },
      ]);
    });
    it('tracks deployment id from response', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'target_environment', value: 'preview' },
        {
          key: 'output:deployment-id',
          value: 'dpl_archive_test',
        },
      ]);
    });
  });

  describe('first deploy', () => {
    describe('project setup', () => {
      const directoryName = 'unlinked';

      beforeEach(() => {
        (client as { nonInteractive: boolean }).nonInteractive = false;
        const user = useUser();
        client.scenario.get(`/v9/projects/:id`, (_req, res) => {
          return res.status(404).json({});
        });

        client.scenario.post(`/v1/projects`, (req, res) => {
          return res.status(200).json(req.body);
        });

        const createdDeploymentId = 'dpl_1';
        client.scenario.post(`/v13/deployments`, (req, res) => {
          res.json({
            creator: {
              uid: user.id,
              username: user.username,
            },
            id: createdDeploymentId,
            readyState: 'READY',
          });
        });

        client.scenario.get(
          `/v13/deployments/${createdDeploymentId}`,
          (req, res) => {
            res.json({
              creator: {
                uid: user.id,
                username: user.username,
              },
              id: createdDeploymentId,
              readyState: 'READY',
              aliasAssigned: true,
              alias: [],
            });
          }
        );

        useTeams('team_dummy');
        client.cwd = setupUnitFixture(`commands/deploy/${directoryName}`);
      });

      it('prefills "project name" prompt based on --name option', async () => {
        const nameOption = 'a-distinct-name';
        client.setArgv('deploy', '--name', nameOption);
        const exitCodePromise = deploy(client);

        await expect(client.stderr).toOutput(
          'The "--name" option is deprecated'
        );

        // I'd like to include project path in this assertion, but it ends up containing
        // a line break in a non-determinsitic location.
        await expect(client.stderr).toOutput('Directory');
        await expect(client.stderr).toOutput('? Which team?');
        client.stdin.write('\n');

        await expect(client.stderr).toOutput('Project?');
        client.stdin.write('\n');

        // The one expecation that the test is actually about!
        await expect(client.stderr).toOutput(`Name? (${nameOption})`);
        client.stdin.write('\n');
        // Fixture has no detectable framework at the root, so the
        // root-directory prompt now fires (nested-monolith guard).
        await expect(client.stderr).toOutput('Code directory?');
        client.stdin.write('\n');
        await expect(client.stderr).toOutput('Customize settings?');
        client.stdin.write('\n');

        const exitCode = await exitCodePromise;
        expect(exitCode).toEqual(0);
        const output = client.stderr.getFullOutput();
        expect(output).not.toContain(
          'In which directory is your code located?'
        );
        expect(output).not.toContain(
          'Do you want to change additional project settings?'
        );
      });

      it('prefills "project name" prompt based on directory name', async () => {
        client.setArgv('deploy');
        const exitCodePromise = deploy(client);

        // I'd like to include project path in this assertion, but it ends up containing
        // a line break in a non-determinsitic location.
        await expect(client.stderr).toOutput('Directory');
        await expect(client.stderr).toOutput('? Which team?');
        client.stdin.write('\n');

        // Unified flow: the project picker replaces the create/link decision.
        await expect(client.stderr).toOutput('Which project?');
        client.events.keypress('down');
        client.events.keypress('enter');

        // The one expecation that the test is actually about! The picker's
        // name prompt renders a back-navigation hint between `Name?` and the
        // prefilled default, so assert the two pieces separately.
        await expect(client.stderr).toOutput('Name?');
        expect(client.stderr.getFullOutput()).toContain(`(${directoryName})`);
        client.stdin.write('\n');
        // Fixture has no detectable framework at the root, so the
        // root-directory prompt now fires (nested-monolith guard).
        await expect(client.stderr).toOutput('Code directory?');
        client.stdin.write('\n');
        await expect(client.stderr).toOutput('Customize settings?');
        client.stdin.write('\n');

        const exitCode = await exitCodePromise;
        expect(exitCode).toEqual(0);
        const output = client.stderr.getFullOutput();
        expect(output).not.toContain(
          'In which directory is your code located?'
        );
        expect(output).not.toContain(
          'Do you want to change additional project settings?'
        );
      });
    });
  });

  describe('production domain aliases', () => {
    it('should display the primary production domain when aliased', async () => {
      const user = useUser();
      useTeams('team_dummy');
      let projectFetchCount = 0;
      client.scenario.get(`/v9/projects/static`, (_req, res) => {
        projectFetchCount++;
        res.json({
          ...defaultProject,
          name: 'static',
          id: 'static',
        });
      });
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
      });

      client.scenario.post(`/v13/deployments`, (req, res) => {
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: 'dpl_with_alias',
          url: 'test-deployment.vercel.app',
          target: 'production',
        });
      });

      let callCount = 0;
      client.scenario.get(`/v13/deployments/dpl_with_alias`, (req, res) => {
        callCount++;
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: 'dpl_with_alias',
          url: 'test-deployment.vercel.app',
          readyState: callCount === 1 ? 'BUILDING' : 'READY',
          aliasAssigned: callCount > 1,
          target: 'production',
          alias:
            callCount > 1
              ? [
                  'my-app.vercel.app',
                  'my-app-team-name.vercel.app',
                  'my-app-hash-team-name.vercel.app',
                ]
              : [],
        });
      });

      client.scenario.get(`/v10/now/deployments/dpl_with_alias`, (req, res) => {
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: 'dpl_with_alias',
          url: 'test-deployment.vercel.app',
          readyState: 'READY',
          aliasAssigned: true,
          target: 'production',
          alias: [
            'my-app.vercel.app',
            'my-app-team-name.vercel.app',
            'my-app-hash-team-name.vercel.app',
          ],
        });
      });

      // Track the background events-stream connection so the test can wait
      // for it to close before returning control (see the comment on the
      // sibling `dpl_streamed_alias` scenario above for why this matters).
      let eventsConnectionClosed = false;
      client.scenario.get(
        `/v3/now/deployments/dpl_with_alias/events`,
        (req, res) => {
          req.on('close', () => {
            eventsConnectionClosed = true;
          });
          res.end();
        }
      );

      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--prod', '--yes');

      const exitCodePromise = deploy(client);

      await expect(client.stderr).toOutput('Production ');
      await expect(client.stderr).toOutput(
        'Aliased         https://my-app.vercel.app'
      );

      // Anti-regression: ANSI is stripped from toOutput, so assert the raw
      // output renders the ▲ gutter exactly once — on the Aliased row, not
      // the Production row. `toOutput` alone would not catch a gutter change.
      const stderrOutput = client.stderr.getFullOutput();
      expect(stderrOutput).not.toContain('▲ Production');
      expect(stderrOutput).toContain('▲ Aliased');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      // One lookup during deploy, one for Deployment Protection settings.
      expect(projectFetchCount).toEqual(2);
      expect(callCount).toEqual(2);

      await vi.waitFor(() => expect(eventsConnectionClosed).toBe(true));
    });

    it('should finish from the streamed alias event without a final deployment fetch', async () => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
      });

      const deploymentId = 'dpl_streamed_alias';
      const aliasAssigned = 1783370781619;
      let statusFetchCount = 0;
      let statusConnectionClosed = false;
      let eventsConnectionClosed = false;

      client.scenario.post(`/v13/deployments`, (_req, res) => {
        res.json({
          creator: { uid: user.id, username: user.username },
          id: deploymentId,
          url: 'streamed-alias.vercel.app',
          readyState: 'BUILDING',
          aliasAssigned: false,
          target: 'production',
          alias: ['initial-streamed-app.vercel.app'],
        });
      });

      client.scenario.get(`/v13/deployments/${deploymentId}`, req => {
        statusFetchCount++;
        // Leave a raced status request open so the alias signal must abort it.
        req.on('close', () => {
          statusConnectionClosed = true;
        });
      });

      client.scenario.get(
        `/v3/now/deployments/${deploymentId}/events`,
        (req, res) => {
          req.on('close', () => {
            eventsConnectionClosed = true;
          });
          res.write(
            `${JSON.stringify({
              type: 'alias-assigned',
              deploymentId,
              date: aliasAssigned,
              alias: ['my-streamed-app.vercel.app'],
              aliasError: null,
              aliasWarning: {
                code: 'alias_warning',
                message: 'Alias warning from event',
              },
            })}\n`
          );
        }
      );

      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--prod', '--yes');

      const exitCode = await deploy(client);

      expect(exitCode).toEqual(0);
      expect(client.stderr.getFullOutput()).toContain(
        'Aliased         https://my-streamed-app.vercel.app'
      );
      expect(client.stderr.getFullOutput()).toContain(
        'Alias warning from event'
      );
      expect(client.stderr.getFullOutput()).not.toContain('alias-assigned');
      expect(statusFetchCount).toBeLessThanOrEqual(1);
      if (statusFetchCount === 1) {
        await vi.waitFor(() => expect(statusConnectionClosed).toBe(true));
      }
      await vi.waitFor(() => expect(eventsConnectionClosed).toBe(true));
    });

    it('should display the ▲ gutter on Production when --no-wait skips the Aliased row', async () => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
      });

      client.scenario.post(`/v13/deployments`, (req, res) => {
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: 'dpl_no_wait',
          url: 'test-no-wait.vercel.app',
          readyState: 'QUEUED',
          target: 'production',
        });
      });

      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--prod', '--yes', '--no-wait');

      const exitCodePromise = deploy(client);

      await expect(client.stderr).toOutput('Production ');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      // The Aliased row never prints with --no-wait, so the ▲ gutter falls
      // back to the Production row.
      const stderrOutput = client.stderr.getFullOutput();
      expect(stderrOutput).toContain('▲ Production');
      expect(stderrOutput).not.toContain('Aliased');
    });

    it('should display the ▲ gutter on Production when --skip-domain skips the Aliased row', async () => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
      });

      client.scenario.post(`/v13/deployments`, (req, res) => {
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: 'dpl_skip_domain',
          url: 'test-skip-domain.vercel.app',
          target: 'production',
        });
      });

      client.scenario.get(`/v13/deployments/dpl_skip_domain`, (req, res) => {
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: 'dpl_skip_domain',
          url: 'test-skip-domain.vercel.app',
          readyState: 'READY',
          aliasAssigned: true,
          target: 'production',
          alias: [],
        });
      });

      client.scenario.get(
        `/v10/now/deployments/dpl_skip_domain`,
        (req, res) => {
          res.json({
            creator: {
              uid: user.id,
              username: user.username,
            },
            id: 'dpl_skip_domain',
            url: 'test-skip-domain.vercel.app',
            readyState: 'READY',
            aliasAssigned: true,
            target: 'production',
            alias: [],
          });
        }
      );

      client.scenario.get(
        `/v3/now/deployments/dpl_skip_domain/events`,
        (req, res) => {
          res.end();
        }
      );

      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--prod', '--yes', '--skip-domain');

      const exitCodePromise = deploy(client);

      await expect(client.stderr).toOutput('Production ');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      // The Aliased row never prints with --skip-domain, so the ▲ gutter
      // falls back to the Production row.
      const stderrOutput = client.stderr.getFullOutput();
      expect(stderrOutput).toContain('▲ Production');
      expect(stderrOutput).not.toContain('Aliased');
    });

    it('should not display aliased domain for preview deployments', async () => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
      });

      client.scenario.post(`/v13/deployments`, (req, res) => {
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: 'dpl_preview',
          url: 'test-preview.vercel.app',
          target: null,
        });
      });

      let callCount = 0;
      client.scenario.get(`/v13/deployments/dpl_preview`, (req, res) => {
        callCount++;
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: 'dpl_preview',
          url: 'test-preview.vercel.app',
          readyState: callCount === 1 ? 'BUILDING' : 'READY',
          aliasAssigned: callCount > 1,
          target: null,
          alias: [],
        });
      });

      client.scenario.get(`/v10/now/deployments/dpl_preview`, (req, res) => {
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: 'dpl_preview',
          url: 'test-preview.vercel.app',
          readyState: 'READY',
          aliasAssigned: false,
          target: null,
          alias: [],
        });
      });

      // Track the background events-stream connection so the test can wait
      // for it to close before returning control (see the comment on the
      // sibling `dpl_streamed_alias` scenario above for why this matters).
      let eventsConnectionClosed = false;
      client.scenario.get(
        `/v3/now/deployments/dpl_preview/events`,
        (req, res) => {
          req.on('close', () => {
            eventsConnectionClosed = true;
          });
          res.end();
        }
      );

      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--yes');

      const exitCodePromise = deploy(client);

      await expect(client.stderr).toOutput('Preview         https');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      const stderrOutput = client.stderr.read().toString();
      expect(stderrOutput).not.toContain('Aliased');

      await vi.waitFor(() => expect(eventsConnectionClosed).toBe(true));
    });

    it('should not display aliased domain when no aliases are assigned', async () => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
      });

      client.scenario.post(`/v13/deployments`, (req, res) => {
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: 'dpl_no_alias',
          url: 'test-no-alias.vercel.app',
          target: 'production',
        });
      });

      let callCount = 0;
      client.scenario.get(`/v13/deployments/dpl_no_alias`, (req, res) => {
        callCount++;
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: 'dpl_no_alias',
          url: 'test-no-alias.vercel.app',
          readyState: callCount === 1 ? 'BUILDING' : 'READY',
          aliasAssigned: callCount > 1,
          target: 'production',
          alias: [],
        });
      });

      client.scenario.get(`/v10/now/deployments/dpl_no_alias`, (req, res) => {
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: 'dpl_no_alias',
          url: 'test-no-alias.vercel.app',
          readyState: 'READY',
          aliasAssigned: false,
          target: 'production',
          alias: [],
        });
      });

      // Track the background events-stream connection so the test can wait
      // for it to close before returning control (see the comment on the
      // sibling `dpl_streamed_alias` scenario above for why this matters).
      let eventsConnectionClosed = false;
      client.scenario.get(
        `/v3/now/deployments/dpl_no_alias/events`,
        (req, res) => {
          req.on('close', () => {
            eventsConnectionClosed = true;
          });
          res.end();
        }
      );

      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--prod', '--yes');

      const exitCodePromise = deploy(client);

      await expect(client.stderr).toOutput('Production      https');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      const stderrOutput = client.stderr.read().toString();
      expect(stderrOutput).not.toContain('Aliased');
      // The deployment waited for aliases, so the ▲ gutter was reserved for
      // the Aliased row — when the server then assigns no aliases, no ▲ is
      // rendered at all (accepted edge case).
      expect(stderrOutput).not.toContain('▲');

      await vi.waitFor(() => expect(eventsConnectionClosed).toBe(true));
    });
  });

  describe('--json', () => {
    const deploymentUrl = 'my-app-abc123.vercel.app';
    const deploymentId = 'dpl_json_test';
    const inspectorUrl = 'https://vercel.com/team/project/dpl_json_test';
    const buildMachine = {
      purchaseType: 'turbo' as const,
      machineSelectionType: 'fixed' as const,
      selectionSource: 'deployment-override' as const,
      cores: 30,
      memory: 61440,
    };
    let resourceConfig: { buildMachine: typeof buildMachine } | undefined;
    let aliasResult: Partial<
      Pick<Deployment, 'aliasWarning' | 'aliasError' | 'alias'>
    >;
    let projectMock: Record<string, unknown>;

    beforeEach(() => {
      resourceConfig = undefined;
      aliasResult = {};
      const user = useUser();
      useTeams('team_dummy');
      projectMock = {
        ...defaultProject,
        name: 'static',
        id: 'static',
      };
      useProject(projectMock);

      client.scenario.post(`/v13/deployments`, (req, res) => {
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: deploymentId,
          url: deploymentUrl,
          inspectorUrl,
          readyState: 'READY',
          target: 'production',
          resourceConfig,
        });
      });
      client.scenario.get(`/v13/deployments/${deploymentId}`, (req, res) => {
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: deploymentId,
          url: deploymentUrl,
          inspectorUrl,
          readyState: 'READY',
          target: 'production',
          aliasAssigned: true,
          alias: [],
          resourceConfig,
          ...aliasResult,
        });
      });
    });

    it.each([
      ['--json', 'aliasWarning'],
      ['--json', 'aliasError'],
      ['--non-interactive', 'aliasWarning'],
      ['--non-interactive', 'aliasError'],
    ] as const)('preserves %s %s from the API', async (flag, field) => {
      aliasResult = {
        [field]: {
          code: 'test_alias_notice',
          message: 'Production domains were not assigned.',
        },
      };
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.nonInteractive = flag === '--non-interactive';
      client.setArgv('deploy', '--prod', flag);

      expect(await deploy(client)).toBe(0);
      const result = JSON.parse(client.stdout.getFullOutput());
      expect((result.deployment ?? result)[field]).toEqual(aliasResult[field]);
    });

    it('reports the assigned production address with --json', async () => {
      aliasResult = { alias: ['my-app.example.com'] };
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--prod', '--json');

      expect(await deploy(client)).toBe(0);
      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.url).toBe(`https://${deploymentUrl}`);
      expect(json.productionUrl).toBe('https://my-app.example.com');
    });

    it('names the production address for agents', async () => {
      aliasResult = { alias: ['my-app.example.com'] };
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.nonInteractive = true;
      client.setArgv('deploy', '--prod', '--non-interactive');

      expect(await deploy(client)).toBe(0);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.deployment.productionUrl).toBe(
        'https://my-app.example.com'
      );
      expect(payload.message).toBe(
        `Deployment ${deploymentUrl} ready. Production URL: https://my-app.example.com`
      );
      expect(payload.next).toContainEqual(
        expect.objectContaining({
          command: 'vercel curl https://my-app.example.com',
        })
      );
    });

    it('does not report a production address when alias assignment failed', async () => {
      aliasResult = {
        alias: ['my-app.example.com'],
        aliasError: { code: 'alias_failed', message: 'Could not assign.' },
      };
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--prod', '--json');

      expect(await deploy(client)).toBe(0);
      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json.productionUrl).toBeNull();
    });

    it('tells agents Deployment Protection is on and how to access it', async () => {
      projectMock.ssoProtection = {
        deploymentType: 'all_except_custom_domains',
      };
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.nonInteractive = true;
      client.setArgv('deploy', '--prod', '--non-interactive');

      expect(await deploy(client)).toBe(0);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.deployment.deploymentProtection).toEqual([
        'vercel_authentication',
      ]);
      expect(payload.next).toContainEqual(
        expect.objectContaining({
          command: `vercel curl https://${deploymentUrl}`,
        })
      );
      // Access is the likely next step; never suggest turning protection off.
      expect(client.stdout.getFullOutput()).not.toContain('protection disable');
    });

    it('does not suggest turning off protection when none is on', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.nonInteractive = true;
      client.setArgv('deploy', '--prod', '--non-interactive');

      expect(await deploy(client)).toBe(0);
      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.deployment.deploymentProtection).toEqual([]);
      expect(JSON.stringify(payload.next)).not.toContain('protection disable');
    });

    it.each([
      'all_except_custom_domains',
      'prod_deployment_urls_and_all_previews',
      'preview',
    ])('does not say production is protected when %s leaves production domains public', async (deploymentType: string) => {
      aliasResult = { alias: ['my-app.example.com'] };
      projectMock.ssoProtection = { deploymentType };
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--prod', '--yes');

      expect(await deploy(client)).toBe(0);
      expect(client.stderr.getFullOutput()).not.toContain(
        'Deployment Protection is on'
      );
    });

    it('says Deployment Protection is on for production under All Deployments', async () => {
      aliasResult = { alias: ['my-app.example.com'] };
      projectMock.ssoProtection = { deploymentType: 'all' };
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--prod', '--yes');

      expect(await deploy(client)).toBe(0);
      expect(client.stderr.getFullOutput()).toContain(
        'Deployment Protection is on for this project (Vercel Authentication).'
      );
    });

    it('says Deployment Protection is on for --skip-domain under Standard Protection', async () => {
      // No production domain, so people open the deployment URL, which
      // Standard Protection still protects.
      projectMock.ssoProtection = {
        deploymentType: 'all_except_custom_domains',
      };
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--prod', '--skip-domain', '--yes');

      expect(await deploy(client)).toBe(0);
      expect(client.stderr.getFullOutput()).toContain(
        'Deployment Protection is on for this project (Vercel Authentication).'
      );
    });

    it('should output deployment and build machine as JSON to stdout with --json', async () => {
      resourceConfig = { buildMachine };
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--json');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      const stdoutOutput = client.stdout.getFullOutput();
      const json = JSON.parse(stdoutOutput);

      expect(json).toEqual({
        id: deploymentId,
        url: `https://${deploymentUrl}`,
        inspectorUrl,
        readyState: 'READY',
        target: 'production',
        deploymentApiUrl: `${client.apiUrl}/v13/deployments/${deploymentId}`,
        productionUrl: null,
        deploymentProtection: [],
        buildMachine: {
          cores: 30,
          memory: 61440,
          machine: 'turbo',
          selectionType: 'fixed',
          selectionSource: 'deployment-override',
        },
      });
      expect(Object.keys(json.buildMachine)).toEqual([
        'cores',
        'memory',
        'machine',
        'selectionType',
        'selectionSource',
      ]);
    });

    it('should include prebuilt collisions in JSON without repeating the spinner in non-TTY output', async () => {
      resourceConfig = { buildMachine };
      const cwd = setupTmpDir('deploy-json-prebuilt-warning');
      await fs.outputFile(join(cwd, 'README.md'), 'ignored source');
      await fs.outputFile(join(cwd, '.vercelignore'), 'README.md\n');
      await fs.outputJson(join(cwd, '.vercel/project.json'), {
        orgId: 'team_dummy',
        projectId: 'static',
      });
      await fs.outputJson(join(cwd, '.vercel/output/config.json'), {
        version: 3,
      });
      await fs.outputJson(
        join(cwd, '.vercel/output/functions/api/example.func/.vc-config.json'),
        {
          runtime: 'nodejs20.x',
          handler: 'index.js',
          filePathMap: {
            'README.md': 'README.md',
          },
        }
      );

      client.stderr.isTTY = false;
      client.setArgv('deploy', cwd, '--prebuilt', '--json');
      const exitCode = await deploy(client);
      const json = JSON.parse(client.stdout.getFullOutput());
      const stderr = client.stderr.getFullOutput();

      expect(exitCode).toEqual(0);
      expect(json.warning).toMatchObject({
        code: 'PREBUILT_FILEPATHMAP_IGNORED',
        message: expect.stringContaining('README.md'),
      });
      expect(json.buildMachine).toEqual({
        cores: 30,
        memory: 61440,
        machine: 'turbo',
        selectionType: 'fixed',
        selectionSource: 'deployment-override',
      });
      expect(stderr.match(/Deploying /g)).toHaveLength(1);
    });

    it('should output deployment and build machine as JSON to stdout with --format=json', async () => {
      resourceConfig = { buildMachine };
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--format', 'json');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      const stdoutOutput = client.stdout.getFullOutput();
      const json = JSON.parse(stdoutOutput);

      expect(json).toEqual({
        id: deploymentId,
        url: `https://${deploymentUrl}`,
        inspectorUrl,
        readyState: 'READY',
        target: 'production',
        deploymentApiUrl: `${client.apiUrl}/v13/deployments/${deploymentId}`,
        productionUrl: null,
        deploymentProtection: [],
        buildMachine: {
          cores: 30,
          memory: 61440,
          machine: 'turbo',
          selectionType: 'fixed',
          selectionSource: 'deployment-override',
        },
      });
    });

    it('should track --json flag telemetry', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--json');
      await deploy(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'flag:json', value: 'TRUE' },
        { key: 'target_environment', value: 'preview' },
        { key: 'output:deployment-id', value: deploymentId },
      ]);
    });

    it('should track --format telemetry', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--format', 'json');
      await deploy(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'option:format', value: 'json' },
        { key: 'target_environment', value: 'preview' },
        { key: 'output:deployment-id', value: deploymentId },
      ]);
    });

    it('should return error for invalid format', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--format', 'xml');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(2);
    });

    it('should output only valid JSON to stdout when piped (non-TTY)', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--json');
      // Simulate piped stdout (non-TTY) like `vc deploy --json | jq`
      client.stdout.isTTY = false;
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      const stdoutOutput = client.stdout.getFullOutput();
      // Should be valid JSON parseable by jq
      const json = JSON.parse(stdoutOutput);
      expect(json).toEqual({
        id: deploymentId,
        url: `https://${deploymentUrl}`,
        inspectorUrl,
        readyState: 'READY',
        target: 'production',
        deploymentApiUrl: `${client.apiUrl}/v13/deployments/${deploymentId}`,
        productionUrl: null,
        deploymentProtection: [],
      });
    });
  });

  describe('--json with failed deployment', () => {
    const deploymentUrl = 'my-app-failed-abc123.vercel.app';
    const deploymentId = 'dpl_json_failed_test';
    const inspectorUrl = 'https://vercel.com/team/project/dpl_json_failed_test';

    it('should output JSON with error field when build fails', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
      });

      // Mock getDeployment endpoint to return a failed deployment
      client.scenario.get(`/v13/deployments/${deploymentUrl}`, (_req, res) => {
        res.json({
          id: deploymentId,
          url: deploymentUrl,
          inspectorUrl,
          readyState: 'ERROR',
          target: null,
          aliasAssigned: false,
          alias: [],
        });
      });

      // Mock createDeploy to simulate a build error
      const mock = vi
        .spyOn(createDeployModule, 'default')
        .mockImplementation(async (_client, now: Now) => {
          // Simulate what processDeployment does: set now.url before throwing
          now.url = deploymentUrl;
          throw new BuildError({
            message: 'Command "npm run build" exited with 1',
            meta: {},
          });
        });

      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--json');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(1);

      const stdoutOutput = client.stdout.getFullOutput();
      const json = JSON.parse(stdoutOutput);

      expect(json).toEqual({
        id: deploymentId,
        url: `https://${deploymentUrl}`,
        inspectorUrl,
        readyState: 'ERROR',
        target: null,
        deploymentApiUrl: `${client.apiUrl}/v13/deployments/${deploymentId}`,
        productionUrl: null,
        error: {
          name: 'BUILD_ERROR',
          message: 'Command "npm run build" exited with 1',
        },
      });

      mock.mockRestore();
    });

    it('should output valid JSON to stdout when piped (non-TTY) and build fails', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
      });

      client.scenario.get(`/v13/deployments/${deploymentUrl}`, (_req, res) => {
        res.json({
          id: deploymentId,
          url: deploymentUrl,
          inspectorUrl,
          readyState: 'ERROR',
          target: null,
          aliasAssigned: false,
          alias: [],
        });
      });

      const mock = vi
        .spyOn(createDeployModule, 'default')
        .mockImplementation(async (_client, now: Now) => {
          now.url = deploymentUrl;
          throw new BuildError({
            message: 'Command "npm run build" exited with 1',
            meta: {},
          });
        });

      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--json');
      client.stdout.isTTY = false;
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(1);

      const stdoutOutput = client.stdout.getFullOutput();
      // Should be valid JSON parseable by jq
      const json = JSON.parse(stdoutOutput);
      expect(json.error).toEqual({
        name: 'BUILD_ERROR',
        message: 'Command "npm run build" exited with 1',
      });
      expect(json.readyState).toEqual('ERROR');

      mock.mockRestore();
    });

    it('should output the agent payload when build fails in non-interactive mode', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
      });

      client.scenario.get(`/v13/deployments/${deploymentUrl}`, (_req, res) => {
        res.json({
          id: deploymentId,
          url: deploymentUrl,
          inspectorUrl,
          readyState: 'ERROR',
          target: null,
          aliasAssigned: false,
          alias: [],
        });
      });

      const mock = vi
        .spyOn(createDeployModule, 'default')
        .mockImplementation(async (_client, now: Now) => {
          now.url = deploymentUrl;
          throw new BuildError({
            message: 'Command "npm run build" exited with 1',
            meta: {},
          });
        });

      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--yes', '--non-interactive');
      (client as { nonInteractive: boolean }).nonInteractive = true;
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(1);

      const json = JSON.parse(client.stdout.getFullOutput());
      expect(json).toMatchObject({
        status: 'error',
        reason: 'build_failed',
        message: 'Command "npm run build" exited with 1',
        deployment: {
          id: deploymentId,
          readyState: 'ERROR',
          error: {
            name: 'BUILD_ERROR',
            message: 'Command "npm run build" exited with 1',
          },
        },
      });
      expect(json.next.map((n: { when: string }) => n.when)).toEqual([
        'read build logs',
        'retry deploy',
      ]);
      expect(json.next[0].command).toContain(`inspect ${deploymentUrl} --logs`);

      (client as { nonInteractive: boolean }).nonInteractive = false;
      mock.mockRestore();
    });

    it('should output JSON with error field when deployment is canceled', async () => {
      useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
      });

      client.scenario.post(`/v13/deployments`, (_req, res) => {
        res.json({
          id: deploymentId,
          url: deploymentUrl,
          inspectorUrl,
          readyState: 'CANCELED',
          target: null,
        });
      });
      client.scenario.get(`/v13/deployments/${deploymentId}`, (_req, res) => {
        res.json({
          id: deploymentId,
          url: deploymentUrl,
          inspectorUrl,
          readyState: 'CANCELED',
          target: null,
          aliasAssigned: false,
          alias: [],
        });
      });

      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--json');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(1);

      const stdoutOutput = client.stdout.getFullOutput();
      const json = JSON.parse(stdoutOutput);

      expect(json).toEqual({
        id: deploymentId,
        url: `https://${deploymentUrl}`,
        inspectorUrl,
        readyState: 'CANCELED',
        target: null,
        deploymentApiUrl: `${client.apiUrl}/v13/deployments/${deploymentId}`,
        productionUrl: null,
        error: {
          name: 'DEPLOYMENT_CANCELED',
          message: 'The deployment has been canceled.',
        },
      });
    });
  });

  describe('deploy init --json', () => {
    const deploymentUrl = 'my-app-init-abc123.vercel.app';
    const deploymentId = 'dpl_init_json_test';
    const inspectorUrl = 'https://vercel.com/team/project/dpl_init_json_test';
    const resourceConfig = {
      buildMachine: {
        purchaseType: 'enhanced' as const,
        machineSelectionType: 'elastic' as const,
        selectionSource: 'elastic-algorithm' as const,
        cores: 8,
        memory: 16384,
      },
    };

    beforeEach(() => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
      });

      client.scenario.post(`/v13/deployments`, (req, res) => {
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: deploymentId,
          url: deploymentUrl,
          inspectorUrl,
          readyState: 'INITIALIZING',
          target: 'production',
          resourceConfig,
        });
      });
      client.scenario.get(`/v13/deployments/${deploymentId}`, (req, res) => {
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: deploymentId,
          url: deploymentUrl,
          inspectorUrl,
          readyState: 'INITIALIZING',
          target: 'production',
          aliasAssigned: false,
          alias: [],
          resourceConfig,
        });
      });
    });

    it('should output deployment as JSON to stdout with --json', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', 'init', '--json');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      const stdoutOutput = client.stdout.getFullOutput();
      const json = JSON.parse(stdoutOutput);

      expect(json).toEqual({
        id: deploymentId,
        url: `https://${deploymentUrl}`,
        inspectorUrl,
        readyState: 'INITIALIZING',
        target: 'production',
        deploymentApiUrl: `${client.apiUrl}/v13/deployments/${deploymentId}`,
        productionUrl: null,
        buildMachine: {
          cores: 8,
          memory: 16384,
          machine: 'enhanced',
          selectionType: 'elastic',
          selectionSource: 'elastic-algorithm',
        },
      });
    });

    it('should output deployment as JSON to stdout with --format=json', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', 'init', '--format', 'json');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      const stdoutOutput = client.stdout.getFullOutput();
      const json = JSON.parse(stdoutOutput);

      expect(json).toEqual({
        id: deploymentId,
        url: `https://${deploymentUrl}`,
        inspectorUrl,
        readyState: 'INITIALIZING',
        target: 'production',
        deploymentApiUrl: `${client.apiUrl}/v13/deployments/${deploymentId}`,
        productionUrl: null,
        buildMachine: {
          cores: 8,
          memory: 16384,
          machine: 'enhanced',
          selectionType: 'elastic',
          selectionSource: 'elastic-algorithm',
        },
      });
    });

    it('should track --json flag telemetry', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', 'init', '--json');
      await deploy(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:init', value: 'init' },
        { key: 'flag:json', value: 'TRUE' },
        { key: 'target_environment', value: 'preview' },
      ]);
    });

    it('should track --format telemetry', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', 'init', '--format', 'json');
      await deploy(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:init', value: 'init' },
        { key: 'option:format', value: 'json' },
        { key: 'target_environment', value: 'preview' },
      ]);
    });

    it('should return error for invalid format', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', 'init', '--format', 'xml');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(2);
    });

    it('should output only valid JSON to stdout when piped (non-TTY)', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', 'init', '--json');
      // Simulate piped stdout (non-TTY) like `vc deploy init --json | jq`
      client.stdout.isTTY = false;
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      const stdoutOutput = client.stdout.getFullOutput();
      // Should be valid JSON parseable by jq
      const json = JSON.parse(stdoutOutput);
      expect(json).toEqual({
        id: deploymentId,
        url: `https://${deploymentUrl}`,
        inspectorUrl,
        readyState: 'INITIALIZING',
        target: 'production',
        deploymentApiUrl: `${client.apiUrl}/v13/deployments/${deploymentId}`,
        productionUrl: null,
        buildMachine: {
          cores: 8,
          memory: 16384,
          machine: 'enhanced',
          selectionType: 'elastic',
          selectionSource: 'elastic-algorithm',
        },
      });
    });
  });

  describe('deployment checks', () => {
    // v1 checks: checksConclusion === 'failed'
    it('should error when v1 checks fail', async () => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
      });

      client.scenario.post(`/v13/deployments`, (_req, res) => {
        res.json({
          creator: { uid: user.id, username: user.username },
          id: 'dpl_checks_v1',
          url: 'checks-v1.vercel.app',
          target: 'production',
        });
      });

      let callCount = 0;
      client.scenario.get(`/v13/deployments/dpl_checks_v1`, (_req, res) => {
        callCount++;
        res.json({
          creator: { uid: user.id, username: user.username },
          id: 'dpl_checks_v1',
          url: 'checks-v1.vercel.app',
          readyState: callCount === 1 ? 'BUILDING' : 'READY',
          aliasAssigned: false,
          checksState: callCount > 1 ? 'completed' : 'running',
          checksConclusion: callCount > 1 ? 'failed' : undefined,
          target: 'production',
          alias: [],
        });
      });

      client.scenario.get(
        `/v1/deployments/dpl_checks_v1/checks`,
        (_req, res) => {
          res.json({
            checks: [
              {
                id: 'chk_1',
                name: 'Lint',
                status: 'completed',
                conclusion: 'failed',
                startedAt: Date.now(),
                completedAt: Date.now(),
                createdAt: Date.now(),
                updatedAt: Date.now(),
                integrationId: 'int_1',
                rerequestable: false,
              },
              {
                id: 'chk_2',
                name: 'Tests',
                status: 'completed',
                conclusion: 'succeeded',
                startedAt: Date.now(),
                completedAt: Date.now(),
                createdAt: Date.now(),
                updatedAt: Date.now(),
                integrationId: 'int_2',
                rerequestable: false,
              },
            ],
          });
        }
      );

      // Track the background events-stream connection so the test can wait
      // for it to close before returning control. Without this the socket
      // opened by `processDeployment()` can still be mid-teardown when the
      // test resolves, which occasionally (and more so on Windows) leaves a
      // live handle open past this test's `afterEach`/`afterAll`, hanging
      // the whole worker's shutdown.
      let eventsConnectionClosed = false;
      client.scenario.get(
        `/v3/now/deployments/dpl_checks_v1/events`,
        (req, res) => {
          req.on('close', () => {
            eventsConnectionClosed = true;
          });
          res.end();
        }
      );

      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--prod', '--yes');

      const exitCode = await deploy(client);
      expect(exitCode).toEqual(1);

      const stderrOutput = client.stderr.read().toString();
      expect(stderrOutput).toContain('1 failed');
      expect(stderrOutput).toContain('1 succeeded');

      await vi.waitFor(() => expect(eventsConnectionClosed).toBe(true));
    });

    // v2 checks: deployment.checks['deployment-alias'].state === 'failed'
    it('should error when v2 deployment checks fail', async () => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
      });

      client.scenario.post(`/v13/deployments`, (_req, res) => {
        res.json({
          creator: { uid: user.id, username: user.username },
          id: 'dpl_checks_v2',
          url: 'checks-v2.vercel.app',
          target: 'production',
          checks: { 'deployment-alias': { state: 'pending' } },
        });
      });

      let callCount = 0;
      client.scenario.get(`/v13/deployments/dpl_checks_v2`, (_req, res) => {
        callCount++;
        const isFailed = callCount > 2;
        res.json({
          creator: { uid: user.id, username: user.username },
          id: 'dpl_checks_v2',
          url: 'checks-v2.vercel.app',
          readyState: callCount === 1 ? 'BUILDING' : 'READY',
          aliasAssigned: false,
          target: 'production',
          alias: [],
          checks: {
            'deployment-alias': {
              state: isFailed ? 'failed' : 'pending',
            },
          },
        });
      });

      client.scenario.get(
        `/v2/deployments/dpl_checks_v2/check-runs`,
        (_req, res) => {
          res.json({
            runs: [
              {
                id: 'cr_1',
                name: 'E2E Tests',
                status: 'completed',
                conclusion: 'failed',
                source: 'vercel',
              },
              {
                id: 'cr_2',
                name: 'Smoke Test',
                status: 'completed',
                conclusion: 'skipped',
                source: 'github',
              },
            ],
          });
        }
      );

      // Track the background events-stream connection so the test can wait
      // for it to close before returning control (see the comment on the
      // sibling `dpl_checks_v1` scenario above for why this matters).
      let eventsConnectionClosed = false;
      client.scenario.get(
        `/v3/now/deployments/dpl_checks_v2/events`,
        (req, res) => {
          req.on('close', () => {
            eventsConnectionClosed = true;
          });
          res.end();
        }
      );

      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--prod', '--yes');

      const exitCode = await deploy(client);
      expect(exitCode).toEqual(1);

      const stderrOutput = client.stderr.read().toString();
      expect(stderrOutput).toContain('Running Checks');
      expect(stderrOutput).toContain('1 failed');
      expect(stderrOutput).toContain('1 skipped');
      expect(stderrOutput).toContain('E2E Tests');

      await vi.waitFor(() => expect(eventsConnectionClosed).toBe(true));
    });

    // v2 checks failure in non-interactive mode
    it('should output failed check runs as JSON in non-interactive mode', async () => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
      });

      client.scenario.post(`/v13/deployments`, (_req, res) => {
        res.json({
          creator: { uid: user.id, username: user.username },
          id: 'dpl_checks_ni',
          url: 'checks-ni.vercel.app',
          inspectorUrl: 'https://vercel.com/test/dpl_checks_ni',
          target: 'production',
          checks: { 'deployment-alias': { state: 'pending' } },
        });
      });

      let callCount = 0;
      client.scenario.get(`/v13/deployments/dpl_checks_ni`, (_req, res) => {
        callCount++;
        res.json({
          creator: { uid: user.id, username: user.username },
          id: 'dpl_checks_ni',
          url: 'checks-ni.vercel.app',
          inspectorUrl: 'https://vercel.com/test/dpl_checks_ni',
          readyState: callCount === 1 ? 'BUILDING' : 'READY',
          aliasAssigned: false,
          target: 'production',
          alias: [],
          checks: {
            'deployment-alias': {
              state: callCount > 2 ? 'failed' : 'pending',
            },
          },
        });
      });

      client.scenario.get(
        `/v2/deployments/dpl_checks_ni/check-runs`,
        (_req, res) => {
          res.json({
            runs: [
              {
                id: 'cr_fail',
                name: 'Lint',
                status: 'completed',
                conclusion: 'failed',
                source: 'vercel',
              },
            ],
          });
        }
      );

      client.scenario.get(
        `/v2/deployments/dpl_checks_ni/check-runs/cr_fail/logs`,
        (_req, res) => {
          res.type('text/plain');
          res.send(
            [
              '{"level":"command","timestamp":1700000000000,"message":"npm run lint"}',
              '{"level":"error","timestamp":1700000001000,"message":"Exited with code 1."}',
              '{"level":"eof","timestamp":1700000002000,"message":""}',
            ].join('\n')
          );
        }
      );

      // Track the background events-stream connection so the test can wait
      // for it to close before returning control (see the comment on the
      // sibling `dpl_checks_v1` scenario above for why this matters).
      let eventsConnectionClosed = false;
      client.scenario.get(
        `/v3/now/deployments/dpl_checks_ni/events`,
        (req, res) => {
          req.on('close', () => {
            eventsConnectionClosed = true;
          });
          res.end();
        }
      );

      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--prod', '--yes', '--non-interactive');
      (client as { nonInteractive: boolean }).nonInteractive = true;

      const exitCode = await deploy(client);
      expect(exitCode).toEqual(1);

      const stdoutOutput = client.stdout.getFullOutput();
      const json = JSON.parse(stdoutOutput);
      expect(json.status).toBe('error');
      expect(json.reason).toBe('checks_failed');
      expect(json.failedCheckRuns).toHaveLength(1);
      expect(json.failedCheckRuns[0].name).toBe('Lint');
      expect(json.failedCheckRuns[0].url).toBe(
        'https://vercel.com/test/dpl_checks_ni?checkRunLog=cr_fail'
      );
      expect(json.failedCheckRuns[0].logs).toEqual([
        { level: 'command', timestamp: 1700000000000, message: 'npm run lint' },
        {
          level: 'error',
          timestamp: 1700000001000,
          message: 'Exited with code 1.',
        },
      ]);

      await vi.waitFor(() => expect(eventsConnectionClosed).toBe(true));
    });

    // v2 checks pending → shows "Running Checks…" spinner
    it('should show Running Checks spinner when v2 checks are pending', async () => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
      });

      client.scenario.post(`/v13/deployments`, (_req, res) => {
        res.json({
          creator: { uid: user.id, username: user.username },
          id: 'dpl_checks_pending',
          url: 'checks-pending.vercel.app',
          target: 'production',
          checks: { 'deployment-alias': { state: 'pending' } },
        });
      });

      let callCount = 0;
      client.scenario.get(
        `/v13/deployments/dpl_checks_pending`,
        (_req, res) => {
          callCount++;
          const isReady = callCount > 1;
          const isAliased = callCount > 2;
          res.json({
            creator: { uid: user.id, username: user.username },
            id: 'dpl_checks_pending',
            url: 'checks-pending.vercel.app',
            readyState: isReady ? 'READY' : 'BUILDING',
            aliasAssigned: isAliased,
            target: 'production',
            alias: isAliased ? ['my-app.vercel.app'] : [],
            checks: {
              'deployment-alias': {
                state: isAliased ? 'succeeded' : 'pending',
              },
            },
          });
        }
      );

      // Track the background events-stream connection so the test can wait
      // for it to close before returning control. This test polls the
      // deployment status endpoint multiple times (real ~1s delays between
      // polls), so the events-stream connection is still comparatively
      // "fresh" (recently active, not yet idle) by the time the test
      // resolves. Without an explicit wait here, the socket can still be
      // mid-teardown when this test's `afterEach` swaps out `client.scenario`
      // for the next test, occasionally (observed on Windows CI) leaving a
      // live handle open into the file's `afterAll`, which then hangs the
      // whole worker's shutdown instead of exiting cleanly.
      let eventsConnectionClosed = false;
      client.scenario.get(
        `/v3/now/deployments/dpl_checks_pending/events`,
        (req, res) => {
          req.on('close', () => {
            eventsConnectionClosed = true;
          });
          res.end();
        }
      );

      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--prod', '--yes');

      const exitCodePromise = deploy(client);

      await expect(client.stderr).toOutput('Running Checks…');
      await expect(client.stderr).toOutput('Aliased         https');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      await vi.waitFor(() => expect(eventsConnectionClosed).toBe(true));
    });
  });

  describe('--project', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    function captureProjectCreates() {
      const creates: any[] = [];
      client.scenario.post('/v1/projects', (req, _res, next) => {
        creates.push(req.body);
        next?.();
      });
      return creates;
    }

    function captureDeployments() {
      const requests: any[] = [];
      client.scenario.post('/v13/deployments', (req, res) => {
        requests.push(req.body);
        res.json({
          id: 'dpl_project_flag',
          readyState: 'READY',
          aliasAssigned: true,
          url: 'project-flag.vercel.app',
          alias: [],
        });
      });
      return requests;
    }

    async function setupStaticDir() {
      const cwd = setupTmpDir();
      await fs.writeFile(join(cwd, 'index.html'), '<h1>hello</h1>');
      return cwd;
    }

    it.each([
      ['in a terminal with --yes', false, ['--yes', '--create-if-missing']],
      ['for an agent', true, ['--create-if-missing']],
    ] as const)('creates a missing --project name and deploys it without linking the directory (%s)', async (_label, nonInteractive, extraArgs) => {
      const cwd = await setupStaticDir();
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      const creates = captureProjectCreates();
      useUnknownProject();
      const requests = captureDeployments();

      client.cwd = cwd;
      client.config.currentTeam = 'team_dummy';
      client.stdin.isTTY = !nonInteractive;
      (client as { nonInteractive: boolean }).nonInteractive = nonInteractive;
      client.setArgv(
        'deploy',
        '--project',
        'new-app',
        '--scope',
        'team_dummy',
        '--no-wait',
        ...extraArgs
      );

      expect(await deploy(client)).toEqual(0);
      expect(creates).toEqual([expect.objectContaining({ name: 'new-app' })]);
      expect(requests).toHaveLength(1);
      expect(requests[0].project).toBe('new-app');
      expect(client.stderr.getFullOutput()).toMatch(/Created\s+\S+\/new-app/);
      expect(client.stderr.getFullOutput()).not.toContain('was not found');
      expect(await fs.pathExists(join(cwd, '.vercel/project.json'))).toBe(
        false
      );
    });

    it('creates a missing --project name in a terminal without --create-if-missing', async () => {
      const cwd = await setupStaticDir();
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      const creates = captureProjectCreates();
      useUnknownProject();
      const requests = captureDeployments();

      client.cwd = cwd;
      client.config.currentTeam = 'team_dummy';
      client.stdin.isTTY = true;
      client.setArgv(
        'deploy',
        '--project',
        'new-app',
        '--scope',
        'team_dummy',
        '--no-wait'
      );
      const exitCodePromise = deploy(client);

      await expect(client.stderr).toOutput('Code directory?');
      client.stdin.write('\n');
      await expect(client.stderr).toOutput('Customize settings?');
      client.stdin.write('\n');

      expect(await exitCodePromise).toEqual(0);
      expect(creates).toEqual([expect.objectContaining({ name: 'new-app' })]);
      expect(requests).toHaveLength(1);
    });

    it('fails with a create command instead of creating under --yes without --create-if-missing', async () => {
      const cwd = await setupStaticDir();
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      const creates = captureProjectCreates();
      useUnknownProject();
      const requests = captureDeployments();

      client.cwd = cwd;
      client.config.currentTeam = 'team_dummy';
      client.setArgv(
        'deploy',
        '--prod',
        '--yes',
        '--project',
        'new-app',
        '--scope',
        'team_dummy'
      );
      const exitCodePromise = deploy(client);

      await expect(client.stderr).toOutput('Project "new-app" was not found');
      expect(await exitCodePromise, 'exit code for "deploy"').toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'To create it:\n  vercel deploy --prod --yes --project new-app --scope team_dummy --create-if-missing\n'
      );
      expect(creates).toEqual([]);
      expect(requests).toEqual([]);
    });

    it('uses --environment for a deprecated --target in the create command', async () => {
      const cwd = await setupStaticDir();
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      const creates = captureProjectCreates();
      useUnknownProject();

      client.cwd = cwd;
      client.config.currentTeam = 'team_dummy';
      client.setArgv(
        'deploy',
        '--target',
        'preview',
        '--yes',
        '--project',
        'new-app',
        '--scope',
        'team_dummy'
      );
      const exitCodePromise = deploy(client);

      await expect(client.stderr).toOutput('Project "new-app" was not found');
      expect(await exitCodePromise, 'exit code for "deploy"').toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'To create it:\n  vercel deploy --environment preview --yes --project new-app --scope team_dummy --create-if-missing\n'
      );
      expect(creates).toEqual([]);
    });

    it('repeats the deploy as typed in the create command', async () => {
      const cwd = setupTmpDir();
      await fs.outputFile(join(cwd, 'site/index.html'), '<h1>hello</h1>');
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      const creates = captureProjectCreates();
      useUnknownProject();
      const requests = captureDeployments();

      client.cwd = cwd;
      client.config.currentTeam = 'team_dummy';
      client.setArgv(
        'deploy',
        'site',
        '--prod',
        '--yes',
        '--prebuilt',
        '--no-wait',
        '--meta',
        'team=web',
        '--regions',
        'sfo1',
        '--project',
        'new-app',
        '--scope',
        'team_dummy'
      );
      const exitCodePromise = deploy(client);

      await expect(client.stderr).toOutput('Project "new-app" was not found');
      expect(await exitCodePromise, 'exit code for "deploy"').toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'To create it:\n  vercel deploy site --prod --yes --prebuilt --no-wait --meta team=web --regions sfo1 --project new-app --scope team_dummy --create-if-missing\n'
      );
      expect(creates).toEqual([]);
      expect(requests).toEqual([]);
    });

    it('hides tokens and replaces Environment Variable values with placeholders in the create command', async () => {
      const cwd = await setupStaticDir();
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      const creates = captureProjectCreates();
      useUnknownProject();

      client.cwd = cwd;
      client.config.currentTeam = 'team_dummy';
      client.setArgv(
        'deploy',
        '--yes',
        '-e',
        'API_KEY=s3cret-env',
        '--build-env=BUILD_KEY=s3cret-build',
        '-ye',
        'OTHER_KEY=s3cret-cluster',
        '--token',
        's3cret-token',
        '--project',
        'new-app',
        '--scope',
        'team_dummy'
      );
      const exitCodePromise = deploy(client);

      await expect(client.stderr).toOutput('Project "new-app" was not found');
      expect(await exitCodePromise, 'exit code for "deploy"').toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        "To create it, replace each <VALUE> with the Environment Variable's value:\n  vercel deploy --yes --env 'API_KEY=<VALUE>' --env 'OTHER_KEY=<VALUE>' --build-env 'BUILD_KEY=<VALUE>' --project new-app --scope team_dummy --create-if-missing\n"
      );
      expect(client.stderr.getFullOutput()).not.toContain('s3cret');
      expect(creates).toEqual([]);
    });

    it('uses canonical flag names in the create command', async () => {
      const cwd = await setupStaticDir();
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      const creates = captureProjectCreates();
      useUnknownProject();

      client.cwd = cwd;
      client.config.currentTeam = 'team_dummy';
      client.setArgv(
        'deploy',
        '-c',
        '-e',
        'FROM_SHELL',
        '--name',
        'old-name',
        '--no-clipboard',
        '--project',
        'new-app',
        '-S',
        'team_dummy'
      );
      const exitCodePromise = deploy(client);

      await expect(client.stderr).toOutput('Project "new-app" was not found');
      expect(await exitCodePromise, 'exit code for "deploy"').toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'To create it:\n  vercel deploy --yes --env FROM_SHELL --project new-app --scope team_dummy --create-if-missing\n'
      );
      expect(creates).toEqual([]);
    });

    it('labels the Environment Variable placeholder for an agent and rejects it when run unedited', async () => {
      const cwd = await setupStaticDir();
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      const creates = captureProjectCreates();
      useUnknownProject();
      const requests = captureDeployments();

      client.cwd = cwd;
      client.stdin.isTTY = false;
      (client as { nonInteractive: boolean }).nonInteractive = true;
      client.setArgv(
        'deploy',
        '-e',
        'NODE_ENV=staging',
        '--project',
        'new-app',
        '--scope',
        'team_dummy'
      );

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(deploy(client)).rejects.toThrow('process.exit(1)');
      const payload = JSON.parse(logSpy.mock.calls[0][0]);
      expect(payload.reason).toBe('project_not_found');
      expect(payload.message).toContain(
        "retry with --create-if-missing, and replace each <VALUE> with the Environment Variable's value."
      );
      expect(payload.next[0]).toEqual({
        command:
          "vercel deploy --env 'NODE_ENV=<VALUE>' --project new-app --scope team_dummy --create-if-missing",
        when: "create the project; replace each <VALUE> with the Environment Variable's value",
      });
      expect(JSON.stringify(payload)).not.toContain('staging');

      // Run the suggestion exactly as printed, split the way a shell would.
      const suggested = (payload.next[0].command as string)
        .match(/'[^']*'|\S+/g)!
        .slice(1)
        .map(word => word.replace(/^'(.*)'$/, '$1'));
      logSpy.mockClear();
      exitSpy.mockClear();
      client.setArgv(...suggested);

      await expect(deploy(client)).rejects.toThrow('process.exit(2)');
      const rejected = JSON.parse(logSpy.mock.calls[0][0]);
      expect(rejected.reason).toBe('invalid_arguments');
      expect(rejected.message).toBe(
        "--env NODE_ENV is still the placeholder <VALUE>. Replace it with the Environment Variable's value."
      );
      expect(creates).toEqual([]);
      expect(requests).toEqual([]);
    });

    it('creates and deploys the same directory when CI runs the suggested command', async () => {
      const cwd = setupTmpDir();
      await fs.outputFile(join(cwd, 'site/index.html'), '<h1>hello</h1>');
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      const creates = captureProjectCreates();
      useUnknownProject();
      const requests = captureDeployments();

      client.cwd = cwd;
      client.config.currentTeam = 'team_dummy';
      client.stdin.isTTY = false;
      client.setArgv(
        'deploy',
        'site',
        '--yes',
        '--no-wait',
        '--project',
        'new-app',
        '--scope',
        'team_dummy'
      );
      expect(await deploy(client)).toEqual(1);
      const suggested = /To create it:\n {2}vercel (.+)\n/.exec(
        client.stderr.getFullOutput()
      )?.[1];
      expect(suggested).toBeDefined();

      client.setArgv(suggested!.split(' '));
      expect(await deploy(client)).toEqual(0);
      expect(creates).toEqual([expect.objectContaining({ name: 'new-app' })]);
      expect(requests).toHaveLength(1);
      expect(requests[0].project).toBe('new-app');
      expect(
        requests[0].files.map((file: { file: string }) => file.file)
      ).toEqual(['index.html']);
    });

    it('suggests a similar project and the create command to an agent without --create-if-missing', async () => {
      const cwd = await setupStaticDir();
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      client.scenario.get('/v9/projects', (_req, res) => {
        res.json({
          projects: [{ ...defaultProject, id: 'prj_my_app', name: 'my-app' }],
          pagination: { count: 1, next: null, prev: null },
        });
      });
      const creates = captureProjectCreates();
      useUnknownProject();
      const requests = captureDeployments();

      client.cwd = cwd;
      client.stdin.isTTY = false;
      (client as { nonInteractive: boolean }).nonInteractive = true;
      client.setArgv('deploy', '--project', 'my-ap', '--scope', 'team_dummy');

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(deploy(client)).rejects.toThrow('process.exit(1)');

      expect(exitSpy).toHaveBeenCalledWith(1);
      const payload = JSON.parse(logSpy.mock.calls[0][0]);
      expect(payload.reason).toBe('project_not_found');
      expect(payload.message).toContain('Did you mean my-app?');
      expect(payload.data).toEqual({ suggestion: 'my-app' });
      expect(payload.next[0]).toEqual({
        command:
          'vercel deploy --project my-ap --scope team_dummy --create-if-missing',
        when: 'create the project',
      });
      expect(
        payload.next.some((step: { command: string }) =>
          step.command.includes('my-app')
        )
      ).toBe(false);
      expect(creates).toEqual([]);
      expect(requests).toEqual([]);
    });

    it.each([
      [
        'without --project',
        ['--create-if-missing'],
        '--create-if-missing requires --project <PROJECT>.',
      ],
      [
        'with --dry',
        ['--dry', '--project', 'new-app', '--create-if-missing'],
        "Can't use --create-if-missing with --dry.",
      ],
    ] as const)('rejects --create-if-missing %s as a usage error', async (_label, args, message) => {
      const cwd = await setupStaticDir();
      useUser();
      useTeams('team_dummy');
      const creates = captureProjectCreates();

      client.cwd = cwd;
      client.setArgv('deploy', ...args);
      const exitCodePromise = deploy(client);

      await expect(client.stderr).toOutput(message);
      expect(await exitCodePromise, 'exit code for "deploy"').toEqual(2);
      expect(creates).toEqual([]);
    });

    it('does not connect the Git repository to a project it creates', async () => {
      const cwd = await setupStaticDir();
      await fs.outputFile(
        join(cwd, '.git/config'),
        '[remote "origin"]\n\turl = https://github.com/user/repo.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n'
      );
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      const gitLinks: any[] = [];
      client.scenario.post(
        '/v9/projects/:projectNameOrId/link',
        (req, _res, next) => {
          gitLinks.push(req.body);
          next?.();
        }
      );
      const creates = captureProjectCreates();
      useUnknownProject();
      const requests = captureDeployments();

      client.cwd = cwd;
      client.config.currentTeam = 'team_dummy';
      client.setArgv(
        'deploy',
        '--project',
        'new-app',
        '--scope',
        'team_dummy',
        '--no-wait',
        '--yes',
        '--create-if-missing'
      );

      expect(await deploy(client)).toEqual(0);
      expect(creates).toEqual([expect.objectContaining({ name: 'new-app' })]);
      expect(requests).toHaveLength(1);
      expect(gitLinks).toEqual([]);
    });

    it('deploys an existing --project without linking the directory', async () => {
      const cwd = await setupStaticDir();
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
        accountId: 'team_dummy',
      });
      const creates = captureProjectCreates();
      const requests = captureDeployments();

      client.cwd = cwd;
      client.config.currentTeam = 'team_dummy';
      client.setArgv(
        'deploy',
        '--project',
        'static',
        '--scope',
        'team_dummy',
        '--no-wait',
        '--yes'
      );

      expect(await deploy(client)).toEqual(0);
      expect(creates).toEqual([]);
      expect(requests[0].project).toBe('static');
      expect(await fs.pathExists(join(cwd, '.vercel'))).toBe(false);
    });

    it('fails without creating anything when a --project ID does not resolve', async () => {
      const cwd = await setupStaticDir();
      useUser();
      useTeams('team_dummy');
      const creates = captureProjectCreates();
      useUnknownProject();

      client.cwd = cwd;
      client.setArgv('deploy', '--yes', '--project=prj_doesnotexist');
      const exitCodePromise = deploy(client);

      await expect(client.stderr).toOutput(
        'Project "prj_doesnotexist" was not found'
      );
      expect(await exitCodePromise, 'exit code for "deploy"').toEqual(1);
      expect(creates).toEqual([]);
    });

    it('fails without creating anything when --dry names a missing --project', async () => {
      const cwd = await setupStaticDir();
      useUser();
      useTeams('team_dummy');
      const creates = captureProjectCreates();
      useUnknownProject();

      client.cwd = cwd;
      client.setArgv('deploy', '--dry', '--project=does-not-exist');
      const exitCodePromise = deploy(client);

      await expect(client.stderr).toOutput(
        'Project "does-not-exist" was not found'
      );
      expect(await exitCodePromise, 'exit code for "deploy"').toEqual(1);
      expect(creates).toEqual([]);
    });

    describe('with VERCEL_PROJECT_ID set', () => {
      let originalOrgId: string | undefined;
      let originalProjectId: string | undefined;

      beforeEach(() => {
        originalOrgId = process.env.VERCEL_ORG_ID;
        originalProjectId = process.env.VERCEL_PROJECT_ID;
      });

      afterEach(() => {
        if (originalOrgId === undefined) delete process.env.VERCEL_ORG_ID;
        else process.env.VERCEL_ORG_ID = originalOrgId;
        if (originalProjectId === undefined)
          delete process.env.VERCEL_PROJECT_ID;
        else process.env.VERCEL_PROJECT_ID = originalProjectId;
      });

      function setupPinnedProject(
        withOrgId: boolean,
        pinnedProjectId = 'static'
      ) {
        useUser({ version: 'northstar' });
        useTeams('team_dummy');
        useProject({
          ...defaultProject,
          name: 'static',
          id: 'static',
          accountId: 'team_dummy',
        });
        const creates = captureProjectCreates();
        useUnknownProject();
        const requests = captureDeployments();
        if (withOrgId) process.env.VERCEL_ORG_ID = 'team_dummy';
        else delete process.env.VERCEL_ORG_ID;
        process.env.VERCEL_PROJECT_ID = pinnedProjectId;
        return { creates, requests };
      }

      it.each([
        ['with VERCEL_ORG_ID', true],
        ['without VERCEL_ORG_ID', false],
      ] as const)('rejects a missing --project as a usage error instead of creating or deploying (%s)', async (_label, withOrgId) => {
        const cwd = await setupStaticDir();
        const { creates, requests } = setupPinnedProject(withOrgId);

        client.cwd = cwd;
        client.setArgv(
          'deploy',
          '--yes',
          '--project',
          'new-app',
          '--create-if-missing'
        );
        const exitCodePromise = deploy(client);

        await expect(client.stderr).toOutput(
          `Can't use --project with VERCEL_PROJECT_ID. --project is "new-app" and VERCEL_PROJECT_ID is "static". Remove one of them.`
        );
        expect(await exitCodePromise, 'exit code for "deploy"').toEqual(2);
        expect(client.stderr.getFullOutput()).toMatch(
          /See all options:\s+vercel deploy --help/
        );
        expect(client.stderr.getFullOutput()).not.toContain('--scope');
        expect(creates).toEqual([]);
        expect(requests).toEqual([]);
      });

      it('reports the pinned project as not found when --project matches VERCEL_PROJECT_ID', async () => {
        const cwd = await setupStaticDir();
        const { creates, requests } = setupPinnedProject(true, 'new-app');

        client.cwd = cwd;
        client.setArgv(
          'deploy',
          '--yes',
          '--project',
          'new-app',
          '--create-if-missing'
        );
        const exitCodePromise = deploy(client);

        await expect(client.stderr).toOutput('Project "new-app" was not found');
        expect(await exitCodePromise, 'exit code for "deploy"').toEqual(1);
        expect(client.stderr.getFullOutput()).not.toContain(
          "Can't use --project with VERCEL_PROJECT_ID"
        );
        expect(creates).toEqual([]);
        expect(requests).toEqual([]);
      });

      it('reports invalid_arguments with exit code 2 for an agent', async () => {
        const cwd = await setupStaticDir();
        const { creates, requests } = setupPinnedProject(true);

        client.cwd = cwd;
        client.stdin.isTTY = false;
        (client as { nonInteractive: boolean }).nonInteractive = true;
        client.setArgv('deploy', '--project', 'new-app', '--create-if-missing');

        const exitSpy = vi
          .spyOn(process, 'exit')
          .mockImplementation((code?: number) => {
            throw new Error(`process.exit(${code})`);
          });
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await expect(deploy(client)).rejects.toThrow('process.exit(2)');

        expect(exitSpy).toHaveBeenCalledWith(2);
        const payload = JSON.parse(logSpy.mock.calls[0][0]);
        expect(payload.status).toBe('error');
        expect(payload.reason).toBe('invalid_arguments');
        expect(payload.message).toContain('VERCEL_PROJECT_ID');
        expect(payload.next).toEqual([
          { command: 'vercel deploy --help', when: 'see all options' },
        ]);
        expect(creates).toEqual([]);
        expect(requests).toEqual([]);
      });
    });

    it('stops with missing_scope instead of choosing a team for an agent', async () => {
      const cwd = await setupStaticDir();
      useUser({ version: 'northstar' });
      useTeams('team_dummy');
      createTeam();
      const creates = captureProjectCreates();
      useUnknownProject();

      client.cwd = cwd;
      client.stdin.isTTY = false;
      (client as { nonInteractive: boolean }).nonInteractive = true;
      client.setArgv('deploy', '--project', 'new-app', '--create-if-missing');

      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number) => {
          throw new Error(`process.exit(${code})`);
        });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(deploy(client)).rejects.toThrow('process.exit(1)');

      expect(exitSpy).toHaveBeenCalledWith(1);
      const payload = JSON.parse(logSpy.mock.calls[0][0]);
      expect(payload.status).toBe('action_required');
      expect(payload.reason).toBe('missing_scope');
      expect(creates).toEqual([]);
    });
  });

  describe('first deployment production notice', () => {
    const deploymentUrl = 'first-deploy-abc123.vercel.app';
    const deploymentId = 'dpl_first_deploy';

    beforeEach(() => {
      const user = useUser();
      useTeams('team_dummy');
      useProject({
        ...defaultProject,
        name: 'static',
        id: 'static',
      });

      client.scenario.post(`/v13/deployments`, (req, res) => {
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: deploymentId,
          url: deploymentUrl,
          readyState: 'READY',
          // API returns production even though no --prod was passed (first deploy)
          target: 'production',
        });
      });
      client.scenario.get(`/v13/deployments/${deploymentId}`, (req, res) => {
        res.json({
          creator: {
            uid: user.id,
            username: user.username,
          },
          id: deploymentId,
          url: deploymentUrl,
          readyState: 'READY',
          target: 'production',
          aliasAssigned: true,
          alias: [],
        });
      });
    });

    it('prints a notice when a non-prod deploy returns a production deployment (TTY)', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--yes');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      const stderrOutput = client.stderr.getFullOutput();
      expect(stderrOutput).toContain('first deployment');
      expect(stderrOutput).toContain('assigned to production');
      expect(stderrOutput).toContain('--prod');
    });

    it('includes a hint and omits "Promote to production" in non-interactive JSON', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      (client as { nonInteractive: boolean }).nonInteractive = true;
      client.setArgv('deploy', '--non-interactive');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      const stdoutOutput = client.stdout.getFullOutput().trim();
      const payload = JSON.parse(stdoutOutput);
      expect(payload.status).toBe('ok');
      expect(payload.hint).toContain('first deployment');
      expect(payload.hint).toContain('assigned to production');
      // "Promote to production" is not useful when already production
      expect(payload.next).not.toContainEqual(
        expect.objectContaining({ when: 'Promote to production' })
      );
      // Inspect is still offered
      expect(payload.next).toContainEqual(
        expect.objectContaining({ when: 'Inspect deployment' })
      );
      expect(payload.next).toContainEqual({
        command: `vercel curl https://${deploymentUrl}`,
        when: 'Verify deployment, including when Deployment Protection is enabled',
      });
      (client as { nonInteractive: boolean }).nonInteractive = false;
    });

    it('does not print the notice when --prod is explicitly used (TTY)', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      client.setArgv('deploy', '--prod', '--yes');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      const stderrOutput = client.stderr.getFullOutput();
      expect(stderrOutput).not.toContain('first deployment');
    });

    it('does not include the hint when --prod is explicitly used (non-interactive)', async () => {
      client.cwd = setupUnitFixture('commands/deploy/static');
      (client as { nonInteractive: boolean }).nonInteractive = true;
      client.setArgv('deploy', '--prod', '--non-interactive');
      const exitCode = await deploy(client);
      expect(exitCode).toEqual(0);

      const stdoutOutput = client.stdout.getFullOutput().trim();
      const payload = JSON.parse(stdoutOutput);
      expect(payload.hint).toBeUndefined();
      (client as { nonInteractive: boolean }).nonInteractive = false;
    });
  });
});
