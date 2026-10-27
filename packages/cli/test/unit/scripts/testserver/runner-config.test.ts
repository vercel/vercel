import { describe, expect, test } from 'vitest';
import {
  buildRunnerVcpus,
  credentialsFromOidc,
  isPrivateOrLoopbackUrl,
  readRunnerConfig,
  runnerBuild,
  runnerOverride,
  runnerTimeoutMs,
  testRunnerVcpus,
  runnerUnreachableReason,
} from '../../../../scripts/testserver/runner-config.mjs';

const PUBLIC_BASE = 'https://sb-abc.vercel.run';

const OVERRIDE = {
  TESTSERVER_RUNNER_TOKEN: 'tok',
  TESTSERVER_RUNNER_TEAM_ID: 'team_2',
  TESTSERVER_RUNNER_PROJECT_ID: 'prj_2',
};
const FORCED_LOCAL = [
  [{ CI: '1' }, 'CI is set'],
  [{ TESTSERVER_RUNNER: 'local' }, 'TESTSERVER_RUNNER=local'],
  [
    { VERCEL_CLI_TEST_BINARY: '/tmp/vercel-darwin-arm64' },
    'VERCEL_CLI_TEST_BINARY is set',
  ],
] as const;

describe('readRunnerConfig()', () => {
  test('uses the runner by default', () => {
    expect(readRunnerConfig({})).toEqual({
      mode: 'runner',
      build: 'runner',
      timeoutMs: 60 * 60_000,
      override: undefined,
    });
    expect(readRunnerConfig({ TESTSERVER_RUNNER: 'sandbox' }).mode).toBe(
      'runner'
    );
  });

  test.each(FORCED_LOCAL)('stays local with %j', (env, reason) => {
    expect(readRunnerConfig(env)).toEqual({ mode: 'local', reason });
  });

  test('checks forced-local reasons in order', () => {
    expect(
      readRunnerConfig({
        CI: '1',
        TESTSERVER_RUNNER: 'local',
        VERCEL_CLI_TEST_BINARY: '/tmp/vercel',
      }).reason
    ).toBe('CI is set');
    expect(
      readRunnerConfig({
        TESTSERVER_RUNNER: 'sandbox',
        VERCEL_CLI_TEST_BINARY: '/tmp/vercel',
      }).reason
    ).toBe('VERCEL_CLI_TEST_BINARY is set');
  });

  test('rejects an unknown TESTSERVER_RUNNER, even under CI', () => {
    for (const env of [
      { TESTSERVER_RUNNER: 'remote' },
      { TESTSERVER_RUNNER: 'remote', CI: '1' },
    ]) {
      expect(() => readRunnerConfig(env)).toThrow(
        /TESTSERVER_RUNNER must be `local` or `sandbox`/
      );
    }
  });

  test('reads the timeout and the override', () => {
    expect(
      readRunnerConfig({ TESTSERVER_RUNNER_TIMEOUT_MINUTES: '90', ...OVERRIDE })
    ).toEqual({
      mode: 'runner',
      build: 'runner',
      timeoutMs: 90 * 60_000,
      override: { token: 'tok', teamId: 'team_2', projectId: 'prj_2' },
    });
  });

  test('reads TESTSERVER_RUNNER_BUILD', () => {
    expect(readRunnerConfig({ TESTSERVER_RUNNER_BUILD: 'local' }).build).toBe(
      'local'
    );
    expect(() =>
      readRunnerConfig({ TESTSERVER_RUNNER_BUILD: 'cloud' })
    ).toThrow(/TESTSERVER_RUNNER_BUILD must be `runner` or `local`/);
    // Meaningless for a local run, so not checked there.
    expect(
      readRunnerConfig({ TESTSERVER_RUNNER_BUILD: 'cloud', CI: '1' }).mode
    ).toBe('local');
  });

  test('rejects a bad timeout or a partial override in runner mode', () => {
    expect(() =>
      readRunnerConfig({ TESTSERVER_RUNNER_TIMEOUT_MINUTES: 'soon' })
    ).toThrow(/TESTSERVER_RUNNER_TIMEOUT_MINUTES must be a positive integer/);
    expect(() => readRunnerConfig({ TESTSERVER_RUNNER_TOKEN: 'tok' })).toThrow(
      /override is incomplete/
    );
  });

  test.each(FORCED_LOCAL)('ignores runner settings with %j', (env, reason) => {
    expect(
      readRunnerConfig({
        ...env,
        TESTSERVER_RUNNER_TIMEOUT_MINUTES: 'soon',
        TESTSERVER_RUNNER_TOKEN: 'tok',
      })
    ).toEqual({ mode: 'local', reason });
  });
});

describe('runnerUnreachableReason()', () => {
  test('accepts public bases', () => {
    expect(runnerUnreachableReason([PUBLIC_BASE])).toBeUndefined();
  });

  test('names a loopback or private base', () => {
    expect(
      runnerUnreachableReason([PUBLIC_BASE, 'http://127.0.0.1:4000'])
    ).toBe('http://127.0.0.1:4000 is not reachable from a runner sandbox');
    expect(runnerUnreachableReason(['http://192.168.1.10:4000'])).toContain(
      '192.168.1.10'
    );
  });

  test('needs a sandbox, so tests skip without one', () => {
    expect(runnerUnreachableReason([])).toBe('no Testserver sandbox');
  });
});

describe('isPrivateOrLoopbackUrl()', () => {
  test.each([
    'http://localhost:4000',
    'http://api.localhost',
    'http://printer.local',
    'http://127.0.0.1:4000',
    'http://127.8.9.10',
    'http://0.0.0.0:4000',
    'http://10.1.2.3',
    'http://172.16.0.1',
    'http://172.31.255.255',
    'http://192.168.0.5',
    'http://169.254.169.254',
    'http://[::1]:4000',
    'http://[fc00::1]',
    'http://[fd12:3456::1]',
    'http://[fe80::1]',
    'http://[::ffff:127.0.0.1]',
    'not a url',
  ])('%s is not reachable from a runner', url => {
    expect(isPrivateOrLoopbackUrl(url)).toBe(true);
  });

  test.each([
    PUBLIC_BASE,
    'https://testserver.vercel.sh',
    'http://172.15.0.1',
    'http://172.32.0.1',
    'http://8.8.8.8',
    'http://[2001:db8::1]',
    'http://localhost.example.com',
  ])('%s is reachable', url => {
    expect(isPrivateOrLoopbackUrl(url)).toBe(false);
  });
});

describe('runnerBuild()', () => {
  test('defaults to building in the runner', () => {
    expect(runnerBuild({})).toBe('runner');
    expect(runnerBuild({ TESTSERVER_RUNNER_BUILD: '' })).toBe('runner');
    expect(runnerBuild({ TESTSERVER_RUNNER_BUILD: 'runner' })).toBe('runner');
  });

  test('reads local and rejects anything else', () => {
    expect(runnerBuild({ TESTSERVER_RUNNER_BUILD: 'local' })).toBe('local');
    expect(() => runnerBuild({ TESTSERVER_RUNNER_BUILD: 'Local' })).toThrow(
      'TESTSERVER_RUNNER_BUILD must be `runner` or `local`, got `Local`'
    );
  });
});

describe('testRunnerVcpus()', () => {
  test('is 2 per sandbox, from 2 to 16', () => {
    expect(testRunnerVcpus(0)).toBe(2);
    expect(testRunnerVcpus(1)).toBe(2);
    expect(testRunnerVcpus(2)).toBe(4);
    expect(testRunnerVcpus(8)).toBe(16);
    expect(testRunnerVcpus(12)).toBe(16);
  });
});

describe('buildRunnerVcpus()', () => {
  test('is at least 8 for the build, and more when the tests need it', () => {
    expect(buildRunnerVcpus(1)).toBe(8);
    expect(buildRunnerVcpus(4)).toBe(8);
    expect(buildRunnerVcpus(6)).toBe(12);
    expect(buildRunnerVcpus(8)).toBe(16);
    expect(buildRunnerVcpus(12)).toBe(16);
  });
});

describe('runnerTimeoutMs()', () => {
  test('defaults to 60 minutes and accepts an override', () => {
    expect(runnerTimeoutMs({})).toBe(60 * 60_000);
    expect(runnerTimeoutMs({ TESTSERVER_RUNNER_TIMEOUT_MINUTES: '90' })).toBe(
      90 * 60_000
    );
  });

  test('rejects a bad override', () => {
    expect(() =>
      runnerTimeoutMs({ TESTSERVER_RUNNER_TIMEOUT_MINUTES: 'soon' })
    ).toThrow(/positive integer/);
  });
});

describe('runnerOverride()', () => {
  test('is undefined when no variable is set', () => {
    expect(runnerOverride({})).toBeUndefined();
  });

  test('reads a complete override', () => {
    expect(runnerOverride(OVERRIDE)).toEqual({
      token: 'tok',
      teamId: 'team_2',
      projectId: 'prj_2',
    });
  });

  test('rejects a partial override', () => {
    expect(() => runnerOverride({ TESTSERVER_RUNNER_TOKEN: 'tok' })).toThrow(
      /TESTSERVER_RUNNER_TOKEN set but TESTSERVER_RUNNER_TEAM_ID, TESTSERVER_RUNNER_PROJECT_ID missing/
    );
  });
});

function jwt(payload: object): string {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part(payload)}.signature`;
}

describe('credentialsFromOidc()', () => {
  test('reads the team and project from the OIDC token', () => {
    const token = jwt({ owner_id: 'team_1', project_id: 'prj_1' });
    expect(credentialsFromOidc(token)).toEqual({
      token,
      teamId: 'team_1',
      projectId: 'prj_1',
    });
  });

  test('rejects a non-Vercel token', () => {
    expect(() => credentialsFromOidc('opaque')).toThrow(/owner_id\/project_id/);
    expect(() => credentialsFromOidc(jwt({ sub: 'x' }))).toThrow(
      /owner_id\/project_id/
    );
  });
});
