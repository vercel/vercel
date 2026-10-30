import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execCli } from '../helpers/exec';
import { getCliPath } from '../helpers/get-cli-path';

// The root parse reads global short flags before the command sees them, so
// these run the built CLI against a local API that records every request.

const binaryPath = getCliPath();

interface Request {
  method: string;
  path: string;
  body: string;
}

let server: Server;
let api: string;
let requests: Request[] = [];
let directory: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      const path = req.url ?? '';
      requests.push({ method: req.method ?? '', path, body });
      const pathname = path.split('?')[0];
      let status = 200;
      let json: unknown;
      if (pathname === '/v2/user') {
        json = {
          user: { id: 'user_1', username: 'me', email: 'me@example.com' },
        };
      } else if (pathname === '/teams/team-b') {
        json = { id: 'team_b', slug: 'team-b', name: 'Team B' };
      } else if (pathname === '/v9/projects/web') {
        const teamId = new URL(path, 'http://localhost').searchParams.get(
          'teamId'
        );
        json = { id: 'prj_web', name: 'web', accountId: teamId ?? 'user_1' };
      } else if (pathname.endsWith('/feature-flags/flags')) {
        json = {
          id: 'flag_1',
          slug: 'checkout',
          kind: 'boolean',
          variants: [],
          environments: {},
        };
      } else {
        status = 404;
        json = { error: { code: 'not_found', message: 'Not found' } };
      }
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'vc-global-short-flags-'));
  return () => rm(directory, { recursive: true, force: true });
});

// Only OS process essentials survive: no ambient credentials or agent markers.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    /^(path|systemroot|comspec|pathext|tmpdir|tmp|temp)$/i.test(key)
  )
);

async function run(...args: string[]) {
  // A fresh config each run, so a team cached by one run can't skip the
  // next run's lookups.
  await writeFile(
    join(directory, 'config.json'),
    JSON.stringify({ credStorage: 'file', telemetry: { enabled: false } })
  );
  await writeFile(
    join(directory, 'auth.json'),
    JSON.stringify({ token: 'dummy' })
  );
  requests = [];
  const result = await execCli(
    binaryPath,
    [...args, '-Q', directory, '--cwd', directory, '--api', api],
    {
      cwd: directory,
      token: false,
      scope: false,
      timeout: 30_000,
      extendEnv: false,
      env: {
        ...env,
        HOME: directory,
        USERPROFILE: directory,
        FORCE_TTY: '0',
        VERCEL_TELEMETRY_DISABLED: '1',
      },
    }
  );
  return { ...result, requests: [...requests] };
}

function debugLines(stderr: string) {
  return stderr.split('\n').filter(line => line.includes('[debug]')).length;
}

function sentDescription(requests: Request[]) {
  const created = requests.find(
    ({ method, path }) =>
      method === 'PUT' && path.includes('/feature-flags/flags')
  );
  return created && JSON.parse(created.body).description;
}

describe('global short flags', () => {
  it('build -p sends the same requests as build --project', async () => {
    const long = await run('build', '--project', 'web', '--scope', 'team-b');
    const short = await run('build', '-p', 'web', '--scope', 'team-b');

    expect(long.requests.map(({ path }) => path)).toContain('/teams/team-b');
    expect(short.requests).toEqual(long.requests);
    expect(short.exitCode).toBe(long.exitCode);
    expect(short.stdout).toBe(long.stdout);
  });

  it('flags create <slug> -d <value> sets the description, not debug', async () => {
    const result = await run(
      'flags',
      'create',
      'checkout',
      '-d',
      'Checkout flow',
      '--project',
      'web'
    );

    expect(result.exitCode).toBe(0);
    expect(sentDescription(result.requests)).toBe('Checkout flow');
    expect(debugLines(result.stderr)).toBe(0);
    expect(result.stderr).toContain('-d is deprecated. Use --description.');
  });

  it.each([
    [['flags', 'create', '-d', 'checkout', '--project', 'web']],
    [['flags', 'create', 'checkout', '--project', 'web', '-d']],
  ])('%j still turns on debug output', async args => {
    const result = await run(...args);

    expect(result.exitCode).toBe(0);
    expect(sentDescription(result.requests)).toBe('');
    expect(debugLines(result.stderr)).toBeGreaterThan(0);
    expect(result.stderr).not.toContain('-d is deprecated');
  });

  it('blob put -t <content type> still fails and points to --content-type', async () => {
    await writeFile(join(directory, 'f.txt'), 'hello');
    const result = await run('blob', 'put', 'f.txt', '-t', 'text/plain');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(
      'You defined "--token", but its contents are invalid'
    );
    expect(result.stderr).toContain(
      'To set the content type, use "--content-type".'
    );
    expect(result.requests).toEqual([]);
  });

  it('keeps the error as it was for --token', async () => {
    await writeFile(join(directory, 'f.txt'), 'hello');
    const result = await run('blob', 'put', 'f.txt', '--token', 'a/b');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).not.toContain('--content-type');
  });
});
