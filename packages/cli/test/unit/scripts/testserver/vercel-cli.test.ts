import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  INSTALL_FIX,
  LOGIN_FIX,
  mintOidcToken,
  NETWORK_FIX,
  runVercel,
  UPGRADE_FIX,
} from '../../../../scripts/testserver/vercel-cli.mjs';

type Result = {
  ok: boolean;
  code?: number | string;
  stdout: string;
  stderr: string;
};

const ok = (stdout: string): Result => ({ ok: true, stdout, stderr: '' });
const fail = (stderr: string, stdout = '', code: number | string = 1) => ({
  ok: false,
  code,
  stdout,
  stderr,
});

const SCOPE_ERROR = 'You do not have access to the specified account';
const SCOPE_STDERR = `Error: ${SCOPE_ERROR}\nLearn More: https://err.sh/vercel/scope-not-accessible\n`;

/** A fake `run` answering by the first argument: `project` or `whoami`. */
function fakeRun(answers: Partial<Record<string, Result>>) {
  return vi.fn(async (args: string[]) => {
    const answer = answers[args[0]];
    if (!answer) throw new Error(`unexpected vercel ${args.join(' ')}`);
    return answer;
  });
}

describe('mintOidcToken()', () => {
  test('returns the token and runs nothing else when minting works', async () => {
    const run = fakeRun({ project: ok('{"token":"oidc-tok"}\n') });

    expect(await mintOidcToken(run)).toEqual({ token: 'oidc-tok' });
    expect(run.mock.calls).toEqual([
      [['project', 'token', 'vercel', '--scope', 'vercel', '--format=json']],
    ]);
  });

  test.each([
    {
      name: 'vercel is not on PATH',
      answers: { project: fail('', '', 'ENOENT') },
      error: '`vercel` is not on PATH',
      fix: INSTALL_FIX,
    },
    {
      name: 'the mint timed out',
      answers: { project: fail('', '', 'TIMEOUT') },
      error: '`vercel project token` timed out after 30s',
      fix: NETWORK_FIX,
    },
    {
      name: 'the mint could not reach Vercel',
      answers: {
        project: fail(
          'Error: The hostname api.vercel.com could not be resolved. Please verify your internet connectivity and DNS configuration.\n'
        ),
      },
      error:
        "`vercel project token` couldn't reach Vercel: The hostname api.vercel.com could not be resolved. Please verify your internet connectivity and DNS configuration.",
      fix: NETWORK_FIX,
    },
    {
      name: 'stderr names a network error the JSON message hides',
      answers: {
        project: fail(
          'request to https://api.vercel.com/v2/user failed, reason: socket hang up\n',
          '{"status":"error","message":"Unexpected error"}'
        ),
      },
      error: "`vercel project token` couldn't reach Vercel: Unexpected error",
      fix: NETWORK_FIX,
    },
    {
      name: 'a 50.25 to 53.2 CLI rejects --format',
      answers: {
        project: fail('Error: unknown or unexpected option: --format\n'),
      },
      error:
        '`vercel` on PATH is older than 53.3.0, the first with `project token --format=json`: unknown or unexpected option: --format',
      fix: UPGRADE_FIX,
    },
    {
      name: 'a pre-50.25 CLI has no project token',
      answers: {
        project: fail(
          'Vercel CLI 50.23.2\nError: Please specify a valid subcommand: inspect | list | add | remove\n\n  ▲ vercel project [command]\n',
          '',
          2
        ),
      },
      error:
        '`vercel` on PATH is older than 53.3.0, the first with `project token --format=json`: Please specify a valid subcommand: inspect | list | add | remove',
      fix: UPGRADE_FIX,
    },
    {
      name: 'whoami fails, so the login lapsed',
      answers: {
        project: fail(SCOPE_STDERR),
        whoami: fail('Error: The specified token is not valid.\n'),
      },
      error: `the saved \`vercel login\` is missing, expired or invalid (\`vercel whoami\`: The specified token is not valid.). \`vercel project token\` said: ${SCOPE_ERROR}`,
      fix: LOGIN_FIX,
    },
    {
      name: 'whoami works, so it is team access (JSON error on stdout)',
      answers: {
        project: fail(
          '',
          '{"status":"error","reason":"forbidden","message":"Not authorized"}'
        ),
        whoami: ok('someone\n'),
      },
      error: 'Not authorized (forbidden) (`vercel whoami` works, as someone)',
      fix: 'Check that someone is a member of the `vercel` team, which owns the `vercel/vercel` project. If it is, run `vercel login` with an account on the `vercel` team again, then retry.',
    },
  ])('diagnoses: $name', async ({ answers, error, fix }) => {
    expect(await mintOidcToken(fakeRun(answers))).toEqual({ error, fix });
  });
});

describe.skipIf(process.platform === 'win32')('runVercel()', () => {
  let dir: string;
  let savedPath: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'testserver-vercel-cli-'));
    savedPath = process.env.PATH;
    process.env.PATH = dir;
  });

  afterEach(() => {
    process.env.PATH = savedPath;
    rmSync(dir, { recursive: true, force: true });
  });

  function fakeVercel(script: string) {
    const file = join(dir, 'vercel');
    writeFileSync(file, `#!/bin/sh\n${script}\n`);
    chmodSync(file, 0o755);
    process.env.PATH = `${dir}:${savedPath}`;
  }

  test('reports a missing vercel as ENOENT', async () => {
    expect(await runVercel(['whoami'])).toMatchObject({
      ok: false,
      code: 'ENOENT',
    });
  });

  test('returns stdout and stderr, with the exit code on failure', async () => {
    fakeVercel(
      'if [ "$1" = whoami ]; then echo me; exit 0; fi\necho out; echo err >&2; exit 3'
    );

    expect(await runVercel(['whoami'])).toEqual({
      ok: true,
      stdout: 'me\n',
      stderr: '',
    });
    expect(await runVercel(['project'])).toEqual({
      ok: false,
      code: 3,
      stdout: 'out\n',
      stderr: 'err\n',
    });
  });

  test('reports a vercel that runs past the timeout as TIMEOUT', async () => {
    fakeVercel('exec sleep 5');

    expect(await runVercel(['whoami'], 200)).toMatchObject({
      ok: false,
      code: 'TIMEOUT',
    });
  });
});
