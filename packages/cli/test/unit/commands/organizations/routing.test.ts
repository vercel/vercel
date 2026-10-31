import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { listen } from 'async-listen';
import execa from 'execa';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';

const cliPath = resolve(__dirname, '../../../../dist/index.js');
const aliases = ['organizations', 'organization'];
const requests: string[] = [];
const server = createServer((req, res) => {
  requests.push(`${req.method} ${req.url}`);
  res.setHeader('content-type', 'application/json');
  if (req.url === '/v2/user') {
    res.end(JSON.stringify({ user: { id: 'user_test', username: 'test' } }));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: { message: 'Unexpected request' } }));
  }
});
let apiUrl: string;
let cwd: string;

beforeAll(async () => {
  apiUrl = (await listen(server, { host: '127.0.0.1', port: 0 })).href;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
});

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'vercel-organizations-routing-'));
  requests.length = 0;
  await writeFile(join(cwd, 'package.json'), '{}');
  await mkdir(join(cwd, 'config'));
  // A matching cached tag proves automatic API routing cannot steal a directory
  // or extension invocation, without fetching a public spec during the test.
  await writeFile(
    join(cwd, 'config/openapi-spec.json'),
    JSON.stringify({
      fetchedAt: Date.now(),
      spec: {
        openapi: '3.0.0',
        info: { title: 'Routing test', version: '1' },
        paths: {
          '/v1/organizations': {
            get: { operationId: 'list', tags: aliases, responses: {} },
          },
          '/v1/organizations/{organizationId}': {
            delete: { operationId: 'delete', tags: aliases, responses: {} },
          },
        },
      },
    })
  );
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
  expect(requests.filter(request => request !== 'GET /v2/user')).toEqual([]);
});

function run(args: string[], env: NodeJS.ProcessEnv = {}) {
  return execa(
    process.execPath,
    [
      cliPath,
      '--global-config',
      join(cwd, 'config'),
      '--api',
      apiUrl,
      '--token',
      'OrganizationRoutingTestToken',
      ...args,
    ],
    {
      cwd,
      reject: false,
      extendEnv: false,
      env: {
        PATH: process.env.PATH,
        PATHEXT: process.env.PATHEXT,
        SystemRoot: process.env.SystemRoot,
        HOME: process.env.HOME,
        USERPROFILE: process.env.USERPROFILE,
        TMPDIR: process.env.TMPDIR,
        TEMP: process.env.TEMP,
        NO_UPDATE_NOTIFIER: '1',
        VERCEL_TELEMETRY_DISABLED: '1',
        NO_COLOR: '1',
        FORCE_COLOR: '0',
        VERCEL_AUTO_API: '1',
        ...env,
      },
    }
  );
}

async function extension(directory: string, name: string, marker: string) {
  await mkdir(directory, { recursive: true });
  const path = join(directory, `vercel-${name}`);
  await writeFile(
    path,
    `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(marker)});\nprocess.exitCode = 6;\n`,
    { mode: 0o755 }
  );
  if (process.platform === 'win32') {
    await writeFile(`${path}.cmd`, `@node "%~dp0vercel-${name}" %*\r\n`);
  }
}

it('keeps stdout free of prose for -F json', async () => {
  const result = await run(['organizations', 'create', '-F', 'json']);
  expect(result.exitCode).toBe(2);
  expect(result.stderr).toContain('--slug');
  expect(result.stdout).toBe('');
});

it('emits an agent payload for a missing flag', async () => {
  const result = await run(['organizations', 'create', '--non-interactive']);
  expect(result.exitCode).toBe(2);
  expect(JSON.parse(result.stdout)).toMatchObject({
    status: 'action_required',
    reason: 'missing_arguments',
  });
});

it('preserves human help when -F json is present', async () => {
  const result = await run(['organizations', 'list', '--help', '-F', 'json']);
  // Help answers on stdout with exit code 0, so the JSON flag must not turn
  // the help page into a payload.
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toContain('Vercel CLI');
  expect(result.stdout).toContain('List organizations you can view');
  expect(result.stdout.trim().startsWith('{')).toBe(false);
});

it.each(
  aliases
)('answers vercel help %s from the command metadata', async alias => {
  const result = await run(['help', alias]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('Manage Vercel organizations');
});

// `afterEach` asserts that no request other than `GET /v2/user` was made, so
// this also proves the mutation never reaches the API.
it.each([
  ['list', []],
  ['create', ['--slug', 'acme-web', '--name', 'Acme Web']],
  ['add', ['--child-team', 'team_test']],
] as [
  string,
  string[],
][])('prints teams %s help instead of running the operation', async (action, args) => {
  const result = await run([
    'organizations',
    'teams',
    action,
    'org_test',
    ...args,
    '--help',
  ]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain(`vercel organizations teams ${action}`);
});

it('reports a missing team selector as action required from the executable', async () => {
  const result = await run([
    'organizations',
    'teams',
    'add',
    'org_test',
    '--non-interactive',
  ]);
  expect(result.exitCode).toBe(2);
  expect(JSON.parse(result.stdout)).toMatchObject({
    status: 'action_required',
    action: 'missing_arguments',
    reason: 'missing_arguments',
    message: 'Provide --child-team with the existing team ID or slug.',
  });
  expect(JSON.parse(result.stdout)).not.toHaveProperty('userActionRequired');
});

// A built-in command wins over an extension and a local path with the same
// name. `vercel deploy organizations` still deploys such a directory.
it.each(
  aliases
)('uses the built-in %s command despite a directory and extension', async alias => {
  await mkdir(join(cwd, alias));
  await extension(join(cwd, 'node_modules/.bin'), alias, `extension:${alias}`);
  const result = await run([alias, '--help']);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('Manage Vercel organizations');
  expect(result.stdout).not.toContain(`extension:${alias}`);
});

// With VERCEL_AUTO_API set and a cached spec that tags a DELETE endpoint, the
// built-in command still answers, so no automatic API call can delete.
it.each([
  ['organizations', 'delete', 'org_test'],
  ['organizations', 'rm', 'org_test'],
  ['organizations', 'teams', 'delete', 'org_test', '--child-team', 'team_test'],
  ['organizations', 'team', 'rm', 'org_test', '--child-team', 'team_test'],
])('rejects removed command %j without falling through to the API', async (...args) => {
  const result = await run([...args, '--non-interactive']);
  // Usage failures keep exit code 2, and agents still get JSON on stdout.
  expect(result.exitCode).toBe(2);
  expect(JSON.parse(result.stdout)).toMatchObject({
    status: 'error',
    reason: 'unknown_command',
  });
});

// `orgs` and `org` are not command aliases, so they stay free for extensions.
it.each(['orgs', 'org'])('runs the vercel-%s extension', async name => {
  await extension(join(cwd, 'node_modules/.bin'), name, `extension:${name}`);
  const result = await run([name, 'list']);
  expect(result.exitCode).toBe(6);
  expect(result.stdout).toBe(`extension:${name}`);
});

it('preserves extensions whose names start with org', async () => {
  await extension(
    join(cwd, 'node_modules/.bin'),
    'org-tools',
    'other extension'
  );
  const result = await run(['org-tools']);
  expect(result.exitCode).toBe(6);
  expect(result.stdout).toBe('other extension');
});
