import type { Deployment } from '@vercel-internals/types';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import { useDeployment, useRuntimeLogs } from '../../mocks/deployment';
import logs from '../../../src/commands/logs';
import { stateString } from '../../../src/commands/list';
import { CommandTimeout } from '../../../src/commands/logs/command';

const logsFixtures = [
  {
    rowId: 1,
    timestampInMs: 1717426870339,
    level: 'info',
    message: 'Hello, world!',
    messageTruncated: false,
    domain: 'acme.com',
    requestMethod: 'GET',
    requestPath: '/',
    responseStatusCode: 200,
  },
  {
    rowId: 2,
    timestampInMs: 1717426870540,
    message: 'Bye...',
    messageTruncated: false,
    domain: 'acme.com',
    requestMethod: 'OPTION',
    requestPath: '/logout',
    responseStatusCode: 204,
  },
];

describe('logs', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('should print error when deployment not found', async () => {
    const user = useUser();
    client.setArgv('logs', 'bad.com');
    await expect(logs(client)).rejects.toThrow(
      `Can't find the deployment "bad.com" under the context "${user.username}"`
    );
  });

  it.each([
    { state: 'DEPLOYING' },
    { state: 'QUEUED' },
    { state: 'ERROR' },
    { state: 'CANCELED' },
  ] as {
    state: Deployment['readyState'];
  }[])('prints disclaimer when deployment is $state', async ({ state }) => {
    const user = useUser();
    const deployment = useDeployment({ creator: user, state });
    client.setArgv('logs', deployment.url);
    const exitCode = await logs(client);
    await expect(client.stderr).toOutput(
      `Fetching deployment "${deployment.url}" in ${user.username}
Error: Deployment not ready. Currently: ${stateString(state)}.
`
    );
    expect(exitCode).toEqual(3);
  });

  it('pretty prints log lines', async () => {
    process.env.TZ = 'UTC';
    const user = useUser();
    const deployment = useDeployment({ creator: user });
    const stdout = vi.spyOn(console, 'log');
    const spy = vi.fn();
    useRuntimeLogs({
      spy,
      deployment,
      logProducer: async function* () {
        for (const log of logsFixtures) {
          yield log;
        }
      },
    });
    client.setArgv('logs', deployment.url);
    const exitCode = await logs(client);
    expect(exitCode).toEqual(0);
    expect(spy).toHaveBeenCalledWith(
      `/v1/projects/${deployment.projectId}/deployments/${deployment.id}/runtime-logs`,
      { format: 'lines' }
    );
    expect(spy).toHaveBeenCalledOnce();
    await expect(client.stderr).toOutput(
      `Fetching deployment "${deployment.url}" in ${user.username}
`
    );
    // 2nd line is time dependent and others are blank lines
    expect(client.getFullOutput().split('\n').slice(3).join('\n'))
      .toMatchInlineSnapshot(`
        "waiting for new logs...
        ℹ️  Jun Mo 15:01:10.33  GET     200  acme.com               /                                 ⏵ Hello, world!
        waiting for new logs...
        ℹ️  Jun Mo 15:01:10.54  OPTION  204  acme.com               /logout                           ⏵ Bye...
        waiting for new logs...
        "
      `);
    expect(stdout).not.toHaveBeenCalled();
  });

  it('prints log lines in json', async () => {
    const user = useUser();
    const deployment = useDeployment({ creator: user });
    const stdout = vi.spyOn(console, 'log').mockImplementation(() => void 0);
    const spy = vi.fn();
    useRuntimeLogs({
      spy,
      deployment,
      logProducer: async function* () {
        for (const log of logsFixtures) {
          yield log;
        }
      },
    });
    client.setArgv('logs', deployment.url, '--json');
    const exitCode = await logs(client);
    expect(exitCode).toEqual(0);
    expect(spy).toHaveBeenCalledWith(
      `/v1/projects/${deployment.projectId}/deployments/${deployment.id}/runtime-logs`,
      { format: 'lines' }
    );
    expect(spy).toHaveBeenCalledOnce();
    await expect(client.stderr).toOutput(
      `Fetching deployment "${deployment.url}" in ${user.username}
`
    );
    expect(stdout).toHaveBeenNthCalledWith(
      1,
      `{"rowId":1,"timestampInMs":1717426870339,"level":"info","message":"Hello, world!","messageTruncated":false,"domain":"acme.com","requestMethod":"GET","requestPath":"/","responseStatusCode":200}`
    );
    expect(stdout).toHaveBeenNthCalledWith(
      2,
      `{"rowId":2,"timestampInMs":1717426870540,"message":"Bye...","messageTruncated":false,"domain":"acme.com","requestMethod":"OPTION","requestPath":"/logout","responseStatusCode":204}`
    );
    expect(stdout).toHaveBeenCalledTimes(2);
  });

  it.todo('stops when receiving "limit exceeded" delimiter from server');

  it.todo('retries on a server error');

  it.todo('does not retry on a server validation error');

  it.todo('resumes showing logs when failing to process a log line');

  it.todo(`aborts the command after ${CommandTimeout}`);
});
