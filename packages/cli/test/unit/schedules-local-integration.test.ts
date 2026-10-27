import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import type { LocalSchedulesSession } from '../../src/util/dev/schedules-session';
import { execCli } from '../helpers/exec';
import { getCliPath } from '../helpers/get-cli-path';

const binaryPath = getCliPath();

it.each([false, true])('local schedules (linked=%s)', async linked => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'vc-schedules-e2e-'));
  const project = join(directory, 'project');
  const devConfig = join(directory, 'dev-config');
  const commandConfig = join(directory, 'command-config');
  const preload = join(directory, 'loopback-only.cjs');
  const networkLog = join(directory, 'network-attempts');
  const sessionDirectory = join(project, '.vercel', 'dev', 'schedules');
  const auth = '{malformed auth storage';
  // Only OS process essentials survive: no ambient credentials, proxies, or NODE_OPTIONS.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      /^(path|systemroot|comspec|pathext|tmpdir|tmp|temp)$/i.test(key)
    )
  );
  async function write(path: string, value: unknown) {
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(
      path,
      typeof value === 'string' ? value : JSON.stringify(value)
    );
  }
  Object.assign(env, {
    HOME: directory,
    USERPROFILE: directory,
    XDG_CONFIG_HOME: directory,
    CI: '1',
    FORCE_TTY: '0',
    FORCE_COLOR: '0',
    NO_COLOR: '1',
    VERCEL_TELEMETRY_DISABLED: '1',
    NO_UPDATE_NOTIFIER: '1',
    NODE_OPTIONS: `--require ${JSON.stringify(preload)}`,
  });
  await write(networkLog, '');
  await write(join(devConfig, 'config.json'), {
    telemetry: { enabled: false },
  });
  await write(join(commandConfig, 'config.json'), {
    credStorage: 'file',
    currentTeam: 'team_saved',
    telemetry: { enabled: false },
  });
  await write(join(commandConfig, 'auth.json'), auth);
  await write(join(project, 'public', 'fixture.txt'), 'static fixture');
  const future = new Date(Date.now() + 7 * 86400_000);
  const cron = `0 0 ${future.getUTCDate()} ${future.getUTCMonth() + 1} *`;
  await write(join(project, 'vercel.json'), {
    builds: [{ src: 'public/**', use: '@vercel/static' }],
    devCommand: null,
    schedules: {
      'static-queue': { schedule: cron, topic: 'static-jobs' },
    },
  });
  await write(
    preload,
    `
const reject = host => {
  const message = 'UNEXPECTED_NETWORK_REQUEST: ' + host + '\\n';
  require('node:fs').appendFileSync(${JSON.stringify(networkLog)}, message);
  process.stderr.write(message);
  throw new Error(message);
};
const checkHost = host => {
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) reject(host);
};
const check = input => {
  if (typeof input === 'string' || input instanceof URL) checkHost(new URL(input).hostname);
  else if (input.url) check(input.url);
  else checkHost(input.hostname || (input.host ? new URL('http://' + input.host).hostname : 'localhost'));
};
const fetch = globalThis.fetch;
globalThis.fetch = function(input, ...args) { check(input); return fetch.call(this, input, ...args); };
for (const protocol of ['node:http', 'node:https']) {
  const transport = require(protocol);
  for (const method of ['request', 'get']) {
    const original = transport[method];
    transport[method] = function(input, ...args) {
      check(input);
      if (args[0] && typeof args[0] === 'object') check(args[0]);
      return original.call(this, input, ...args);
    };
  }
}
// Bundled undici bypasses global fetch and http.request; guard it before connection.
require('node:diagnostics_channel').channel('undici:request:create').subscribe(({ request }) => check(request.origin));
require('node:module').syncBuiltinESMExports();
`
  );
  const launch = binaryPath.endsWith('.js')
    ? [process.execPath, binaryPath]
    : [binaryPath];
  const dev = spawn(
    launch[0],
    [
      ...launch.slice(1),
      'dev',
      '--local',
      '--listen=127.0.0.1:0',
      '--queue-port=0',
      '--runtime-cache-port=0',
      '--schedules-port=0',
      '-Q',
      devConfig,
      '--non-interactive=false',
    ],
    { cwd: project, env, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let output = '';
  let forced = false;
  dev.stdout.on('data', chunk => (output += chunk));
  dev.stderr.on('data', chunk => (output += chunk));
  dev.on('error', error => (output += error.stack));
  const closed = new Promise<void>(resolve =>
    dev.once('close', () => resolve())
  );
  async function stop() {
    if (dev.exitCode !== null || dev.signalCode !== null) return closed;
    dev.kill('SIGTERM');
    const timer = setTimeout(() => {
      forced = true;
      dev.kill('SIGKILL');
    }, 10_000);
    try {
      await closed;
    } finally {
      clearTimeout(timer);
    }
  }
  const globals = ['-Q', commandConfig, '--non-interactive=false', '--json'];
  async function run(args: readonly string[], cwd = project, exitCode = 0) {
    const localArgs = linked
      ? ['schedules', ...args, '-L']
      : ['--local', 'schedules', ...args];
    const result = await execCli(
      binaryPath,
      [...globals, '--cwd', cwd, ...localArgs],
      {
        cwd: directory,
        token: false,
        scope: false,
        timeout: 30_000,
        extendEnv: false,
        env: {
          ...env,
          VERCEL_TOKEN: 'invalid/ambient/token',
          VERCEL_SCOPE: 'ambient-team',
          VERCEL_TEAM_ID: 'team_ambient',
          VERCEL_ORG_ID: 'team_ambient',
          VERCEL_PROJECT_ID: 'prj_ambient',
        },
      }
    );
    expect(result.stderr).not.toContain('UNEXPECTED_NETWORK_REQUEST');
    expect(result.exitCode, result.stderr || result.stdout).toBe(exitCode);
    if (exitCode) return result.stderr;
    return JSON.parse(result.stdout);
  }
  try {
    await expect
      .poll(() => output, { timeout: 30_000 })
      .toMatch(/Available at http:\/\/127\.0\.0\.1:\d+/);
    const files = (await fs.readdir(sessionDirectory)).filter(file =>
      file.endsWith('.json')
    );
    expect(files).toHaveLength(1);
    const descriptor = join(sessionDirectory, files[0]);
    const session: LocalSchedulesSession = JSON.parse(
      await fs.readFile(descriptor, 'utf8')
    );
    expect(session).toMatchObject({
      cwd: await fs.realpath(project),
      pid: dev.pid,
      projectId: 'prj_local',
    });
    expect(session.origin).toMatch(/^http:\/\/127\.0\.0\.1:[1-9]\d*$/);
    const origin = (label: string) =>
      output.match(new RegExp(`${label}\\s+(http://127\\.0\\.0\\.1:\\d+)`))![1];
    const headers = {
      authorization: 'Bearer vc-dev-token',
      'x-vercel-schedules-dev-session': session.id,
    };
    const request = (url: string, method = 'GET') =>
      fetch(url, {
        method,
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
    async function query(path: string, status = 200) {
      const response = await request(`${session.origin}${path}`);
      expect(response.status).toBe(status);
      return response.json();
    }
    const staticFile = await request(
      `${origin('Available at')}/public/fixture.txt`
    );
    expect(staticFile.status).toBe(200);
    expect(await staticFile.text()).toBe('static fixture');
    expect(await query('/v1/info')).toEqual(session);
    expect(await run(['list'])).toMatchObject({
      data: [{ name: 'static-queue', source: 'static' }],
      cursor: null,
    });
    if (linked) {
      // Link only after startup: commands must use the running broker's identity.
      await write(join(project, '.vercel', 'project.json'), {
        projectId: 'prj_fake',
        orgId: 'team_fake',
        projectName: 'fake-project',
      });
    }
    const name = 'dynamic';
    for (const [args, expected] of [
      [
        ['create', name, `--cron=${cron}`, '--topic=jobs'],
        { source: 'dynamic', state: 'active' },
      ],
      [['get', name], { projectId: session.projectId }],
      [
        ['update', name, '--topic=updated-jobs', '--payload={"version":2}'],
        { target: { type: 'queue', topic: 'updated-jobs' } },
      ],
      [['disable', name], { state: 'inactive' }],
      [['enable', name], { state: 'active' }],
      [['disable', name], { state: 'inactive' }],
      [['enable', name, '--for=1h'], { state: 'active' }],
    ] as const) {
      const result = await run(args);
      expect(result).toMatchObject(expected);
      expect(result).not.toHaveProperty('trackId');
      expect(await query(`/v1/schedules/${name}`)).toMatchObject(result);
    }
    const { data } = await run(['ls']);
    expect(data.map((s: { name: string }) => s.name).sort()).toEqual([
      name,
      'static-queue',
    ]);
    expect(await run(['invoke', name])).toEqual({
      invoked: true,
      name,
      namespace: 'default',
    });
    const messages = await request(
      `${origin('Vercel Queues')}/api/v3/topic/updated-jobs/consumer/test`,
      'POST'
    );
    expect(messages.status).toBe(200);
    const message = JSON.parse(
      (await messages.text()).split('\r\n\r\n')[1].split('\r\n')[0]
    );
    expect(message).toMatchObject({
      name,
      payload: { version: 2 },
    });
    expect(await run([linked ? 'rm' : 'delete', name, '--yes'])).toMatchObject({
      deleted: true,
      scheduleId: message.scheduleId,
    });
    await query(`/v1/schedules/${name}`, 404);
    expect(await run(['get', name], project, 1)).toContain(
      'Schedule not found: default/dynamic'
    );
    expect(await run(['executions', 'ls', 'static-queue'], project, 1)).toMatch(
      /execution history is not supported/i
    );
    expect(await run(['list'], join(project, 'public'), 1)).toContain(
      'No running local Schedules session'
    );
    expect(await run(['list'])).toMatchObject({
      data: [{ name: 'static-queue' }],
    });
    expect(await query('/v1/info')).toEqual(session);
    await stop();
    expect(forced, output).toBe(false);
    if (process.platform !== 'win32') {
      await expect(fs.readFile(descriptor)).rejects.toMatchObject({
        code: 'ENOENT',
      });
    }
    expect(await run(['list'], project, 1)).toContain(
      'No running local Schedules session'
    );
    expect(await fs.readFile(join(commandConfig, 'auth.json'), 'utf8')).toBe(
      auth
    );
  } finally {
    await stop();
    try {
      expect(await fs.readFile(networkLog, 'utf8')).toBe('');
      expect(output).not.toContain('UNEXPECTED_NETWORK_REQUEST');
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }
}, 120_000);
