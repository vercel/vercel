import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import flags from '../../../../src/commands/flags';
import { DATAFILE_URL } from '../../../../src/commands/flags/datafile';
import {
  type FetchDispatcher,
  setFetchDispatcher,
} from '../../../../src/util/fetch';
import {
  removeProjectLink,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

const datafileContents = {
  projectId: 'vercel-flags-test',
  environment: 'development',
  revision: 244,
  configUpdatedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
  segments: {},
  definitions: {
    'disabled-flag': {
      environments: { development: 1 },
      variantIds: ['off', 'on'],
      variants: [false, true],
    },
    'reused-flag': {
      environments: {
        development: { reuse: 'production' },
        production: {
          fallthrough: 0,
          rules: [
            {
              conditions: [[['user', 'id'], 'eq', 'user_1']],
              outcome: 1,
            },
          ],
          targets: [{}, { user: { id: ['user_2', 'user_3'] } }],
        },
      },
      variantIds: ['off', 'on'],
      variants: [false, true],
    },
    'split-flag': {
      environments: {
        development: {
          fallthrough: {
            type: 'split',
            base: ['user', 'id'],
            defaultVariant: 0,
            weights: [25, 75],
          },
        },
      },
      variantIds: ['a', 'b'],
      variants: ['control', 'treatment'],
    },
    'rollout-flag': {
      environments: {
        development: {
          fallthrough: {
            type: 'rollout',
            base: ['user', 'id'],
            startTimestamp: 0,
            rollFromVariant: 0,
            rollToVariant: 1,
            defaultVariant: 0,
            slots: [[5000, 3600000]],
          },
        },
      },
      variantIds: ['off', 'on'],
      variants: [false, true],
    },
  },
};

describe('flags datafile', () => {
  let tokenRequests: number;
  let tokenRequestTeamId: unknown;
  let oidcStatus: number;
  let oidcToken: string | undefined;

  beforeEach(() => {
    tokenRequests = 0;
    oidcStatus = 200;
    oidcToken = 'oidc-token';
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
      accountId: 'team_dummy',
    });
    client.scenario.post('/projects/:projectId/token', (req, res) => {
      tokenRequests++;
      tokenRequestTeamId = req.query.teamId;
      res.status(oidcStatus).json({ token: oidcToken });
    });
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.cwd = cwd;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setFetchDispatcher(undefined);
  });

  function jsonResponse(body: unknown = datafileContents) {
    return new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
    });
  }

  /** Answers the datafile request with `response`, or rejects with an error. */
  function mockDatafileFetch(response: Response | Error = jsonResponse()) {
    const realFetch = globalThis.fetch;
    return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (String(input) !== DATAFILE_URL) return realFetch(input, init);
      return response instanceof Error
        ? Promise.reject(response)
        : Promise.resolve(response);
    });
  }

  function getDatafileCall(fetchMock: ReturnType<typeof mockDatafileFetch>) {
    return fetchMock.mock.calls.find(
      ([input]) => String(input) === DATAFILE_URL
    );
  }

  function getDatafileHeaders(fetchMock: ReturnType<typeof mockDatafileFetch>) {
    return getDatafileCall(fetchMock)?.[1]?.headers as Record<string, string>;
  }

  function pipeStdin(input: string) {
    client.stdin.isTTY = false;
    client.stdin.end(`${input}\n`);
  }

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('flags', 'datafile', '--help');
      const exitCode = await flags(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'flags:datafile',
        },
      ]);
    });
  });

  it("requests the OIDC token for the project's team without changing the saved team", async () => {
    mockDatafileFetch();
    client.config.currentTeam = 'team_saved';

    client.setArgv('flags', 'datafile');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(tokenRequestTeamId).toEqual('team_dummy');
    expect(client.config.currentTeam).toEqual('team_saved');
  });

  it('requests a development OIDC token and prints the datafile', async () => {
    const fetchMock = mockDatafileFetch();

    client.setArgv('flags', 'datafile');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(tokenRequests).toEqual(1);

    expect(getDatafileHeaders(fetchMock).authorization).toEqual(
      'Bearer oidc-token'
    );
    expect(getDatafileCall(fetchMock)?.[1]?.redirect).toEqual('error');

    expect(client.stdout.getFullOutput()).toEqual('');
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('4 feature flags in the development datafile for');
    expect(stderr).toContain('(revision 244, updated 2d ago)');
    expect(stderr).toMatch(/disabled-flag\s+true\s*\n/);
    expect(stderr).toMatch(/reused-flag\s+false, true\s+1\s+2\s+production/);
    expect(stderr).toMatch(/split-flag\s+2 variants\s+0\s+0/);
    expect(stderr).toMatch(/rollout-flag\s+false, true\s+0\s+0/);
    expect(stderr).toContain(
      'To see the full datafile including rules, run `vercel flags datafile --json`'
    );
    expect(stderr).not.toContain('user_2');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:datafile',
        value: 'datafile',
      },
    ]);
  });

  it.each([
    'preview',
    'production',
  ])('uses the user token for %s even with OIDC available', async environment => {
    const fetchMock = mockDatafileFetch();

    client.setArgv('flags', 'datafile', '--environment', environment);
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);

    const headers = getDatafileHeaders(fetchMock);
    expect(headers.authorization).toEqual(
      `VercelUser ${client.authConfig.token}`
    );
    expect(tokenRequests).toEqual(0);
    expect(headers['x-vercel-env']).toEqual(environment);
    expect(headers).not.toHaveProperty('x-vercel-flags-auth');
    expect(headers['x-vercel-flags-team-id']).toEqual('team_dummy');
    expect(headers['x-vercel-flags-project-id']).toEqual('vercel-flags-test');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:datafile', value: 'datafile' },
      { key: 'option:environment', value: environment },
    ]);
  });

  it('uses development for user authentication when no OIDC token is returned', async () => {
    oidcToken = undefined;
    const fetchMock = mockDatafileFetch();

    client.setArgv('flags', 'datafile');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(getDatafileHeaders(fetchMock)['x-vercel-env']).toEqual(
      'development'
    );
  });

  it.each([
    403, 429, 500,
  ])('uses the user token when the OIDC endpoint returns %i', async status => {
    oidcStatus = status;
    const fetchMock = mockDatafileFetch();
    client.setArgv('flags', 'datafile', '--environment', 'development');
    expect(await flags(client)).toEqual(0);
    expect(tokenRequests).toBeGreaterThan(0);
    const headers = getDatafileHeaders(fetchMock);
    expect(headers.authorization).toEqual(
      `VercelUser ${client.authConfig.token}`
    );
    expect(headers).not.toHaveProperty('x-vercel-flags-auth');
    expect(headers['x-vercel-env']).toEqual('development');
  });

  it('refreshes user credentials before sending them to Flags', async () => {
    vi.spyOn(client, 'ensureAuthorized').mockImplementation(async () => {
      client.authConfig.token = 'refreshed-user-token';
    });
    const fetchMock = mockDatafileFetch();
    client.setArgv('flags', 'datafile', '--environment', 'production');
    expect(await flags(client)).toEqual(0);
    expect(getDatafileHeaders(fetchMock).authorization).toEqual(
      'VercelUser refreshed-user-token'
    );
    expect(client.stdout.getFullOutput()).not.toContain('refreshed-user-token');
    expect(client.stderr.getFullOutput()).not.toContain('refreshed-user-token');
  });

  it('rejects an invalid environment', async () => {
    client.setArgv('flags', 'datafile', '--environment', 'staging');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(2);
    await expect(client.stderr).toOutput('Invalid environment "staging"');
  });

  it('sends the datafile request through the configured proxy', async () => {
    const dispatcher: FetchDispatcher = { dispatch: vi.fn() };
    setFetchDispatcher(dispatcher);
    const fetchMock = mockDatafileFetch();

    // The fake dispatcher applies to every CLI request and never answers, so
    // use an SDK key: that path makes no Vercel API requests.
    pipeStdin('vf_server_abc');
    client.setArgv('flags', 'datafile', '--sdk-key');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(getDatafileCall(fetchMock)?.[1]).toMatchObject({ dispatcher });
  });

  it('authenticates with an SDK key read from stdin without minting an OIDC token', async () => {
    const fetchMock = mockDatafileFetch();

    pipeStdin('vf_server_abc');
    client.setArgv('flags', 'datafile', '--sdk-key');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(tokenRequests).toEqual(0);

    const headers = getDatafileHeaders(fetchMock);
    expect(headers.authorization).toEqual('Bearer vf_server_abc');
    expect(headers).not.toHaveProperty('x-vercel-env');
    expect(headers).not.toHaveProperty('x-vercel-flags-project-id');
    expect(headers).not.toHaveProperty('x-vercel-flags-auth');
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(
      '4 feature flags in the development datafile for vercel-flags-test'
    );
    expect(stderr).toContain('run `vercel flags datafile --sdk-key --json`');
    expect(stderr).not.toContain('vf_server_abc');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:datafile', value: 'datafile' },
      { key: 'flag:sdk-key', value: 'TRUE' },
    ]);
  });

  it('reads the SDK key from a masked prompt in a terminal', async () => {
    const fetchMock = mockDatafileFetch();

    client.setArgv('flags', 'datafile', '--sdk-key');
    const exitCodePromise = flags(client);
    await expect(client.stderr).toOutput('SDK key');
    client.stdin.write('vf_server_abc\n');
    expect(await exitCodePromise).toEqual(0);

    expect(getDatafileHeaders(fetchMock).authorization).toEqual(
      'Bearer vf_server_abc'
    );
    expect(client.stderr.getFullOutput()).not.toContain('vf_server_abc');
  });

  it('asks for the SDK key on stdin in non-interactive mode', async () => {
    client.nonInteractive = true;
    client.setArgv('flags', 'datafile', '--sdk-key');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'action_required',
      reason: 'missing_key',
      next: [{ command: 'vercel flags datafile --sdk-key < <SDK_KEY_FILE>' }],
    });
  });

  it('asks for the SDK key on stdin with --json', async () => {
    client.setArgv('flags', 'datafile', '--sdk-key', '--json');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(2);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      status: 'action_required',
      reason: 'missing_key',
      message:
        'Missing SDK key. Pipe it to stdin instead, for example vercel flags datafile --sdk-key < sdk-key.txt.',
      hint: 'Run one of the commands in next[] to complete without prompting.',
      next: [
        {
          command: 'vercel flags datafile --sdk-key --json < <SDK_KEY_FILE>',
          when: 'Replace <SDK_KEY_FILE> with a file that contains the SDK key',
        },
      ],
    });
    expect(client.stderr.getFullOutput()).not.toContain('SDK key');
  });

  it('rejects empty stdin for the SDK key', async () => {
    pipeStdin('');
    client.setArgv('flags', 'datafile', '--sdk-key');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(2);
    await expect(client.stderr).toOutput('No SDK key was read from stdin.');
  });

  it.each([
    ['a line break', 'vf_server_secret\nsecond-line'],
    ['a space', 'vf_server_secret with-space'],
    ['a control character', 'vf_server_secret\u0000'],
  ])('rejects an SDK key with %s before sending it, without echoing it', async (_label, key) => {
    const fetchMock = mockDatafileFetch();
    pipeStdin(key);
    client.setArgv('flags', 'datafile', '--sdk-key');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(2);
    expect(getDatafileCall(fetchMock)).toBeUndefined();
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(
      "The SDK key can't contain spaces, line breaks, or other control characters."
    );
    expect(stderr).not.toContain('vf_server_secret');
    expect(client.stdout.getFullOutput()).not.toContain('vf_server_secret');
  });

  it('redacts the SDK key from a failed request error', async () => {
    mockDatafileFetch(
      new TypeError(
        'Headers.append: "Bearer vf_server_abc" is an invalid header value.'
      )
    );
    pipeStdin('vf_server_abc');
    client.setArgv('flags', 'datafile', '--sdk-key');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('"Bearer [REDACTED]" is an invalid header value');
    expect(stderr).not.toContain('vf_server_abc');
  });

  it('redacts the SDK key from an error response body', async () => {
    mockDatafileFetch(
      new Response('Invalid SDK key vf_server_abc', {
        status: 401,
        statusText: 'Unauthorized',
      })
    );
    pipeStdin('vf_server_abc');
    client.setArgv('flags', 'datafile', '--sdk-key', '--json');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
    const stdout = client.stdout.getFullOutput();
    expect(JSON.parse(stdout).error.message).toEqual(
      'Failed to fetch datafile (401 Unauthorized): Invalid SDK key [REDACTED]'
    );
    expect(stdout).not.toContain('vf_server_abc');
  });

  it('rejects an SDK key with an unknown prefix without echoing it', async () => {
    pipeStdin('not-an-sdk-key-secret');
    client.setArgv('flags', 'datafile', '--sdk-key');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(2);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(
      'The SDK key must start with vf_server_ or vf_client_.'
    );
    expect(stderr).not.toContain('not-an-sdk-key-secret');
  });

  it.each([
    [['--sdk-key=vf_server_abc']],
    [['--sdk-key', 'vf_server_abc']],
    [['vf_server_abc']],
  ])('rejects an SDK key passed as an argument without echoing it (%j)', async args => {
    client.setArgv('flags', 'datafile', ...args, '--json');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(2);
    const stdout = client.stdout.getFullOutput();
    expect(JSON.parse(stdout)).toEqual({
      error: {
        code: 'INVALID_ARGUMENTS',
        message:
          "SDK keys can't be passed as arguments. Pipe it to stdin instead, for example vercel flags datafile --sdk-key < sdk-key.txt.",
      },
    });
    expect(stdout).not.toContain('vf_server_abc');
    expect(client.stderr.getFullOutput()).not.toContain('vf_server_abc');
  });

  it('rejects other arguments', async () => {
    client.setArgv('flags', 'datafile', 'my-flag');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(2);
    await expect(client.stderr).toOutput(
      "`vercel flags datafile` doesn't take arguments."
    );
  });

  it('rejects --environment together with --sdk-key', async () => {
    client.setArgv(
      'flags',
      'datafile',
      '--sdk-key',
      '--environment',
      'production'
    );
    const exitCode = await flags(client);
    expect(exitCode).toEqual(2);
    await expect(client.stderr).toOutput(
      'The --environment option cannot be used with --sdk-key'
    );
  });

  it('rejects --project together with --sdk-key', async () => {
    client.setArgv(
      'flags',
      'datafile',
      '--sdk-key',
      '--project',
      'vercel-flags-test'
    );
    const exitCode = await flags(client);
    expect(exitCode).toEqual(2);
    await expect(client.stderr).toOutput(
      'The --project option cannot be used with --sdk-key'
    );
  });

  it('forwards --project and --environment in the --json hint', async () => {
    mockDatafileFetch();
    removeProjectLink(client.cwd);

    client.setArgv(
      'flags',
      'datafile',
      '--project',
      'vercel-flags-test',
      '--environment',
      'development'
    );
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain(
      'run `vercel flags datafile --project vercel-flags-test --environment development --json`'
    );
  });

  it('lists every variant a flag can serve', async () => {
    const variantIds = ['a', 'b', 'c', 'd'];
    mockDatafileFetch(
      jsonResponse({
        ...datafileContents,
        definitions: {
          'single-string': {
            environments: {
              development: { fallthrough: 1, rules: [{ outcome: 1 }] },
            },
            variantIds,
            variants: ['blue', 'green'],
          },
          'long-string': {
            environments: { development: 0 },
            variantIds,
            variants: ['a very long string variant that will not fit'],
          },
          'many-numbers': {
            environments: {
              development: {
                fallthrough: 0,
                rules: [{ outcome: 1 }, { outcome: 2 }, { outcome: 3 }],
              },
            },
            variantIds,
            variants: [1, 2, 3, 4],
          },
          'weighted-split': {
            environments: {
              development: {
                fallthrough: {
                  type: 'split',
                  base: ['user', 'id'],
                  defaultVariant: 0,
                  weights: [50, 0, 50],
                },
              },
            },
            variantIds,
            variants: [1, 2, 3],
          },
          'experiment-flag': {
            environments: {
              development: { fallthrough: { type: 'experiment' } },
            },
            experiment: { weights: [0, 100], defaultVariant: 0 },
            variantIds,
            variants: [false, true],
          },
        },
      })
    );

    client.setArgv('flags', 'datafile');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toMatch(/single-string\s+"green"\s+1\s+0/);
    expect(stderr).toMatch(/long-string\s+"a very long string variant t…/);
    expect(stderr).toMatch(/many-numbers\s+4 variants\s+3\s+0/);
    expect(stderr).toMatch(/weighted-split\s+1, 3\s+0\s+0/);
    expect(stderr).toMatch(/experiment-flag\s+false, true\s+0\s+0/);
  });

  it('reports an empty datafile', async () => {
    mockDatafileFetch(jsonResponse({ ...datafileContents, definitions: {} }));

    client.setArgv('flags', 'datafile');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain(
      'No feature flags in the development datafile for'
    );
  });

  it('prints a datafile in an unknown format as-is', async () => {
    mockDatafileFetch(jsonResponse({ unexpected: true }));

    client.setArgv('flags', 'datafile');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      unexpected: true,
    });
  });

  it('wraps the datafile in a JSON document with --json', async () => {
    mockDatafileFetch();

    client.setArgv('flags', 'datafile', '--json');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      datafile: datafileContents,
    });

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:datafile', value: 'datafile' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it('reports a failed datafile request', async () => {
    mockDatafileFetch(
      new Response('unauthorized', { status: 401, statusText: 'Unauthorized' })
    );

    client.setArgv('flags', 'datafile');
    const exitCode = await flags(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Failed to fetch datafile (401 Unauthorized): unauthorized'
    );
  });
});
