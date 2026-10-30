import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execCli } from '../helpers/exec';
import { getCliPath } from '../helpers/get-cli-path';

const binaryPath = getCliPath();
const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
);

describe('--version', () => {
  let directory: string;
  let projectDirectory: string;
  let server: Server;
  let apiUrl: string;
  let requests: string[];

  beforeAll(async () => {
    // Answers every request, so a command that runs by mistake reaches the
    // API instead of failing before it.
    server = createServer((req, res) => {
      requests.push(`${req.method} ${req.url}`);
      const path = req.url?.split('?')[0] ?? '';
      const body = path.startsWith('/v2/user')
        ? { user: { id: 'user_1', username: 'me', email: 'me@example.com' } }
        : path.startsWith('/v9/projects/')
          ? { id: 'prj_1', name: 'my-app', accountId: 'user_1' }
          : path.includes('/feature-flags/')
            ? {
                id: 'flag_1',
                slug: 'my-flag',
                kind: 'boolean',
                variants: [],
                environments: {},
              }
            : { id: 'res_1' };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    });
    await new Promise<void>(resolve =>
      server.listen(0, '127.0.0.1', () => resolve())
    );
    apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    directory = await mkdtemp(join(tmpdir(), 'vc-version-option-'));
    await writeFile(
      join(directory, 'auth.json'),
      JSON.stringify({ token: 'test_token' })
    );
    await writeFile(
      join(directory, 'config.json'),
      JSON.stringify({ telemetry: { enabled: false } })
    );
    projectDirectory = join(directory, 'project');
    await mkdir(join(projectDirectory, '.vercel'), { recursive: true });
    await writeFile(
      join(projectDirectory, '.vercel', 'project.json'),
      JSON.stringify({ projectId: 'prj_1', orgId: 'user_1' })
    );
    await writeFile(join(projectDirectory, 'index.html'), 'hello');
  });

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });

  beforeEach(() => {
    requests = [];
  });

  // Runs the CLI in a linked project, so a command that runs by mistake can
  // deploy or call the API.
  function run(args: string[]) {
    return execCli(
      binaryPath,
      [...args, '--global-config', directory, '--api', apiUrl],
      {
        cwd: projectDirectory,
        token: false,
        scope: false,
        timeout: 30_000,
        env: {
          VERCEL_TOKEN: '',
          VERCEL_ORG_ID: '',
          VERCEL_PROJECT_ID: '',
          VERCEL_TELEMETRY_DISABLED: '1',
        },
      }
    );
  }

  it.each([
    [['--version']],
    [['-v']],
    [['deploy', '--version']],
    [['--prod', '--version']],
    [['env', 'list', '--version']],
    [['flags', '--version']],
    [['env', '--version']],
    [['flags', 'create', 'my-flag', '--version']],
  ])('vercel %j prints only the version', async args => {
    const result = await run(args);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toBe(version);
    expect(requests).toEqual([]);
  });

  it.each([
    [['--version', '--json']],
    [['-v', '--json']],
    [['deploy', '--version', '--json']],
  ])('vercel %j prints the version as JSON', async args => {
    const result = await run(args);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ version });
    expect(requests).toEqual([]);
  });

  it.each([
    [['deploy', '--help', '--version'], 'vercel deploy'],
    [['--help', '--version'], 'vercel [options]'],
    [['-hv'], 'vercel [options]'],
  ])('vercel %j prints help', async (args, synopsis) => {
    const result = await run(args);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain(synopsis);
    expect(result.stdout).not.toBe(version);
    expect(requests).toEqual([]);
  });

  // `redirects list` defines its own `--version`, which the global `-v` sets.
  it.each(['--version', '-v'])('runs `redirects list %s ver_1`', async flag => {
    const result = await run(['redirects', 'list', flag, 'ver_1']);
    expect(result.stdout).not.toBe(version);
    expect(requests).toContainEqual(
      expect.stringMatching(/^GET \/v1\/bulk-redirects\?/)
    );
  });

  // `-v` is the hidden short form of `--variant` on some `flags` commands.
  it('runs `flags create -v`', async () => {
    const result = await run([
      'flags',
      'create',
      'my-flag',
      '--kind',
      'boolean',
      '-v',
      'true',
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).not.toBe(version);
    expect(requests).toContain('PUT /v1/projects/prj_1/feature-flags/flags');
  });

  // These pass options they don't define, like curl's `-v`, to the program.
  it.each([
    [['curl', '/', '-v']],
    [['curl', '/', '--version']],
    [['httpstat', '/', '-v']],
    [['traces', 'create', '/', '-v']],
  ])('runs vercel %j', async args => {
    const result = await run(args);
    expect(result.stdout).not.toBe(version);
    expect(requests).toContain('GET /v9/projects/prj_1');
  });

  // Deploy rejects an option it doesn't take, as it does without --version.
  it('rejects an option before any command that deploy does not take', async () => {
    const result = await run(['--not-an-option', '--version']);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--not-an-option');
    expect(requests).toEqual([]);
  });
});
