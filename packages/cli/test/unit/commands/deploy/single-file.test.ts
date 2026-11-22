import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';
import fs from 'fs-extra';
import { join } from 'path';
import type { Project } from '@vercel-internals/types';
import deploy from '../../../../src/commands/deploy';
import { client } from '../../../mocks/client';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import {
  defaultProject,
  useProject,
  useUnknownProject,
} from '../../../mocks/project';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';

const staticSettings = {
  framework: null,
  buildCommand: '',
  installCommand: '',
  outputDirectory: null,
  rootDirectory: null,
};

async function setupLinkedFile(
  name = 'claude-kill.txt',
  settings: Partial<Project> = {}
) {
  const cwd = setupTmpDir();
  const content = 'single static file\n';
  const path = join(cwd, name);
  await fs.writeFile(path, content);
  await fs.writeFile(join(cwd, 'unrelated.txt'), 'must not be uploaded');
  await fs.outputJson(join(cwd, '.vercel/project.json'), {
    projectId: 'static',
    orgId: 'team_dummy',
    projectName: 'static',
  });
  const project = {
    ...defaultProject,
    name: 'static',
    id: 'static',
    accountId: 'team_dummy',
    ...settings,
  };
  useUser();
  useTeams('team_dummy');
  useProject(project);
  client.cwd = cwd;
  return { cwd, path, content, project };
}

function captureDeployment() {
  const requests: any[] = [];
  client.scenario.post('/v13/deployments', (req, res) => {
    requests.push(req.body);
    res.json({
      id: 'dpl_single_file',
      readyState: 'READY',
      aliasAssigned: true,
      url: 'single-file.vercel.app',
      alias: [],
    });
  });
  return requests;
}

afterEach(() => {
  vi.restoreAllMocks();
  (client as { nonInteractive: boolean }).nonInteractive = false;
});

describe('single-file deployments', () => {
  it.each([
    'html',
    'htm',
    'md',
    'txt',
    'png',
  ])('deploys only the selected .%s file through the existing uploader', async ext => {
    const { path, content } = await setupLinkedFile(`example.${ext}`);
    const requests = captureDeployment();
    client.setArgv('deploy', path, '--no-wait', '--json');

    expect(await deploy(client)).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0].projectSettings).toMatchObject(staticSettings);
    expect(requests[0].files).toEqual([
      ext === 'txt' || ext === 'png'
        ? {
            file: `example.${ext}`,
            sha: createHash('sha1').update(content).digest('hex'),
            size: Buffer.byteLength(content),
            mode: expect.any(Number),
          }
        : {
            file: `example.${ext}`,
            data: Buffer.from(content).toString('base64'),
            encoding: 'base64',
            mode: expect.any(Number),
          },
    ]);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      id: 'dpl_single_file',
    });
    expect(client.stderr.getFullOutput()).not.toContain(
      'Support for single file deployments has been removed'
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:no-wait', value: 'TRUE' },
      { key: 'flag:json', value: 'TRUE' },
      { key: 'argument:project-path', value: '[REDACTED]' },
      { key: 'target_environment', value: 'preview' },
      { key: 'output:deployment-id', value: 'dpl_single_file' },
    ]);
  });

  it('uploads missing text content and retries deployment creation', async () => {
    const { path, content } = await setupLinkedFile();
    const sha = createHash('sha1').update(content).digest('hex');
    let uploaded: string | undefined;
    let attempts = 0;
    client.scenario.post('/v13/deployments', (req, res) => {
      attempts++;
      expect(req.body.files.map((file: { file: string }) => file.file)).toEqual(
        ['claude-kill.txt']
      );
      if (!uploaded) {
        res
          .status(400)
          .json({ error: { code: 'missing_files', missing: [sha] } });
      } else {
        res.json({
          id: 'dpl_single_file',
          readyState: 'READY',
          url: 'single-file.vercel.app',
        });
      }
    });
    client.scenario.post('/v2/files', (req, res) => {
      const chunks: string[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk.toString('utf8')));
      req.on('end', () => {
        uploaded = chunks.join('');
        res.end();
      });
    });
    client.setArgv('deploy', path, '--no-wait');
    expect(await deploy(client)).toBe(0);
    expect(uploaded).toBe(content);
    expect(attempts).toBe(2);
  });

  it('overrides inherited app settings without reading parent config or changing the project', async () => {
    const { cwd, path, project } = await setupLinkedFile('note.txt', {
      framework: 'nextjs',
      rootDirectory: 'apps/web',
      buildCommand: 'next build',
      installCommand: 'pnpm install',
      outputDirectory: '.next',
    });
    await fs.writeFile(join(cwd, 'vercel.json'), 'not valid JSON');
    await fs.writeFile(
      join(cwd, 'vercel.ts'),
      'throw new Error("must not run")'
    );
    await fs.writeFile(join(cwd, 'package.json'), 'not valid JSON');
    client.localConfig = {
      builds: [{ src: '*.txt', use: '@vercel/node' }],
      env: { PARENT_CONFIG: 'must not inherit' },
    };
    const requests = captureDeployment();
    client.setArgv('deploy', path, '--no-wait');
    expect(await deploy(client)).toBe(0);
    expect(requests[0].projectSettings).toMatchObject(staticSettings);
    expect(requests[0].outputDirectory).toBeNull();
    expect(requests[0].builds).toBeUndefined();
    expect(requests[0].env).toEqual({});
    expect(requests[0].gitMetadata).toBeUndefined();
    expect(project.framework).toBe('nextjs');
    expect(project.rootDirectory).toBe('apps/web');
  });

  it.each([
    ['claude-kill.txt', 'claude-kill', true],
    ['Report Copy.txt', 'report-copy', false],
  ] as const)('creates and links a static project for %s (non-interactive: %s)', async (filename, name, nonInteractive) => {
    const cwd = setupTmpDir();
    const path = join(cwd, filename);
    await fs.writeFile(path, 'hello');
    await fs.writeFile(join(cwd, 'package.json'), 'not valid JSON');
    await fs.writeFile(join(cwd, 'vercel.json'), 'not valid JSON');
    useUser({ version: 'northstar' });
    useTeams('team_dummy');
    const creates: any[] = [];
    client.scenario.post('/v1/projects', (req, _res, next) => {
      creates.push(req.body);
      next?.();
    });
    useUnknownProject();
    const requests = captureDeployment();
    client.cwd = cwd;
    client.stdin.isTTY = !nonInteractive;
    (client as { nonInteractive: boolean }).nonInteractive = nonInteractive;
    client.setArgv('deploy', path, '--yes', '--no-wait');
    expect(await deploy(client)).toBe(0);
    expect(creates).toEqual([
      expect.objectContaining({ ...staticSettings, name }),
    ]);
    expect(requests[0].name).toBe(name);
    expect(requests[0].projectSettings).toMatchObject(staticSettings);
    expect(await fs.readJson(join(cwd, '.vercel/project.json'))).toMatchObject({
      projectId: name,
      projectName: name,
    });
    expect(client.stderr.getFullOutput()).not.toMatch(
      /root directory|Customize settings|Git repository/
    );
  });

  it('keeps a file linked to its parent instead of an ancestor services project', async () => {
    const { cwd, path } = await setupLinkedFile('note.txt');
    const child = join(cwd, 'files');
    await fs.ensureDir(child);
    const selectedFile = join(child, 'note.txt');
    await fs.move(path, selectedFile);
    await fs.move(join(cwd, '.vercel'), join(child, '.vercel'));
    await fs.outputJson(join(cwd, '.vercel/project.json'), {
      projectId: 'ancestor',
      orgId: 'team_dummy',
      projectName: 'ancestor',
    });
    await fs.writeJson(join(cwd, 'vercel.json'), {
      services: { web: { root: 'files', framework: null } },
    });
    useProject({ ...defaultProject, id: 'ancestor', name: 'ancestor' });
    const requests = captureDeployment();
    client.setArgv('deploy', selectedFile, '--no-wait');
    expect(await deploy(client)).toBe(0);
    expect(requests[0].project).toBe('static');
    expect(
      requests[0].files.map((file: { file: string }) => file.file)
    ).toEqual(['note.txt']);
  });

  it('honors --project without uploading that project directory', async () => {
    const { cwd, path } = await setupLinkedFile('note.txt');
    await fs.remove(join(cwd, '.vercel'));
    client.config.currentTeam = 'team_dummy';
    const requests = captureDeployment();
    client.setArgv(
      'deploy',
      path,
      '--project',
      'static',
      '--scope',
      'team_dummy',
      '--no-wait'
    );
    expect(await deploy(client)).toBe(0);
    expect(requests[0].project).toBe('static');
    expect(
      requests[0].files.map((file: { file: string }) => file.file)
    ).toEqual(['note.txt']);
  });

  it('previews only the selected file and the static preset with --dry', async () => {
    const { path } = await setupLinkedFile('note.txt', { framework: 'nextjs' });
    const requests = captureDeployment();
    client.setArgv('deploy', path, '--dry', '--json');
    expect(await deploy(client)).toBe(0);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      fileCount: 1,
      framework: { slug: null },
      files: [{ path: 'note.txt' }],
    });
    expect(requests).toHaveLength(0);
  });

  it.each([
    '--prebuilt',
    '--archive=tgz',
    '--local-config=config.json',
  ])('rejects %s before creating a deployment', async flag => {
    const { path } = await setupLinkedFile();
    const requests = captureDeployment();
    client.setArgv('deploy', path, flag, '--json');
    expect(await deploy(client)).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_file_deployment_option',
    });
    expect(requests).toHaveLength(0);
  });

  it("keeps the parent directory's temporary state when logged in", async () => {
    const { cwd, path } = await setupLinkedFile();
    const anonymousState = join(cwd, '.vercel/anonymous.json');
    await fs.outputJson(anonymousState, {
      projectId: 'prj_anon',
      token: 'vcn_dummy',
      claimUrl: 'https://vercel.com/claim-deployment?code=claim_dummy',
      expiresAt: Date.now() + 3600_000,
    });
    captureDeployment();
    client.setArgv('deploy', path);
    expect(await deploy(client)).toBe(0);
    expect(await fs.pathExists(anonymousState)).toBe(true);
  });

  it('rejects symbolic links as deployment paths', async () => {
    const { cwd, path } = await setupLinkedFile();
    const link = join(cwd, 'linked.txt');
    await fs.symlink(path, link);
    const requests = captureDeployment();
    client.setArgv('deploy', link);
    expect(await deploy(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Deploy a regular file or directory'
    );
    expect(requests).toHaveLength(0);
  });

  it('preserves the selected file in non-interactive retry guidance', async () => {
    const { path } = await setupLinkedFile('Report Copy.txt');
    client.scenario.post('/v13/deployments', (_req, res) => {
      res.status(400).json({
        error: { code: 'bad_request', message: 'Test deployment failure' },
      });
    });
    (client as { nonInteractive: boolean }).nonInteractive = true;
    client.setArgv('deploy', path, '--project', 'static', '--no-wait');
    expect(await deploy(client)).toBe(1);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.status).toBe('error');
    expect(payload.next[0].command).toContain(`deploy '${path}'`);
    expect(payload.next[0].command).toContain('--project static');
  });

  it.each([
    ['.env.local', {}],
    ['secret.html', { '.vercelignore': 'secret.html\n' }],
  ])('rejects %s because the ignore rules exclude it', async (name, files) => {
    const { cwd, path } = await setupLinkedFile(name);
    for (const [file, content] of Object.entries(files)) {
      await fs.writeFile(join(cwd, file), content);
    }
    const requests = captureDeployment();
    client.setArgv('deploy', path, '--yes', '--json');
    expect(await deploy(client)).toBe(1);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'invalid_file_deployment_option',
      message: expect.stringContaining('default ignore list'),
    });
    expect(requests).toHaveLength(0);
  });

  it('rejects a file inside an ignored directory of the current directory', async () => {
    const { cwd } = await setupLinkedFile();
    const path = join(cwd, 'node_modules/pkg/index.html');
    await fs.outputFile(path, '<h1>dependency</h1>\n');
    const requests = captureDeployment();
    client.setArgv('deploy', path);
    expect(await deploy(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'index.html matches `.vercelignore` or the default ignore list'
    );
    expect(requests).toHaveLength(0);
  });

  it('requires --yes for a hidden file in non-interactive mode', async () => {
    const { path } = await setupLinkedFile('.env');
    const requests = captureDeployment();
    (client as { nonInteractive: boolean }).nonInteractive = true;
    client.setArgv('deploy', path);
    expect(await deploy(client)).toBe(1);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      status: 'action_required',
      reason: 'confirmation_required',
    });
    expect(payload.next[0].command).toContain('--yes');
    expect(requests).toHaveLength(0);
  });

  it('cancels a hidden file deployment when the prompt is declined', async () => {
    const { path } = await setupLinkedFile('.env');
    const requests = captureDeployment();
    client.setArgv('deploy', path);
    const exitCode = deploy(client);
    await expect(client.stderr).toOutput(
      '.env is a hidden file and will be publicly accessible once deployed. Continue?'
    );
    client.stdin.write('n\n');
    await expect(client.stderr).toOutput('Canceled');
    await expect(exitCode).resolves.toBe(0);
    expect(requests).toHaveLength(0);
  });

  it('deploys a hidden file with --yes', async () => {
    const { path } = await setupLinkedFile('.well-known');
    const requests = captureDeployment();
    client.setArgv('deploy', path, '--yes', '--no-wait', '--json');
    expect(await deploy(client)).toBe(0);
    expect(
      requests[0].files.map((file: { file: string }) => file.file)
    ).toEqual(['.well-known']);
  });

  it('keeps manual deployment init directory-only', async () => {
    const { path } = await setupLinkedFile();
    client.setArgv('deploy', 'init', path);
    expect(await deploy(client)).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'This command requires a directory'
    );
  });
});
