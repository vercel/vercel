import type { Deployment } from '@vercel-internals/types';
// import from node because vitest won't mock it
import { setTimeout } from 'timers';
import { promisify } from 'util';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useDeployment, useRuntimeLogs } from '../../../mocks/deployment';
import logs from '../../../../src/commands/logs';
import { stateString } from '../../../../src/commands/list';
import { CommandTimeout } from '../../../../src/commands/logs/command';

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
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'logs';

      client.setArgv(command, '--help');
      const exitCodePromise = logs(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  describe('[url|deploymentId]', () => {
    let user: ReturnType<typeof useUser>;
    let deployment: Deployment;
    const runtimeEndpointSpy = vi.fn();

    beforeAll(() => {
      process.env.TZ = 'UTC';
    });

    beforeEach(() => {
      vi.useFakeTimers();
      vi.clearAllMocks();
      user = useUser();
      deployment = useDeployment({ creator: user });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('prints help message', async () => {
      client.setArgv('logs', '-h');
      expect(await logs(client)).toEqual(2);
      expect(client.getFullOutput()).toMatchInlineSnapshot(`
        "
          ▲ vercel logs url|deploymentId [options]

          Display runtime logs for a deployment in ready state, from now and for 5      
          minutes at most.                                                              

          Options:

          -j,  --json  Print each log line as a JSON object (compatible with JQ)        


          Global Options:

               --cwd <DIR>            Sets the current working directory for a single   
                                      run of a command                                  
          -d,  --debug                Debug mode (default off)                          
          -Q,  --global-config <DIR>  Path to the global \`.vercel\` directory            
          -h,  --help                 Output usage information                          
          -A,  --local-config <FILE>  Path to the local \`vercel.json\` file              
               --no-color             No color mode (default off)                       
          -S,  --scope                Set a custom scope                                
          -t,  --token <TOKEN>        Login token                                       
          -v,  --version              Output the version number                         


          Examples:

          - Pretty print all the new runtime logs for the deployment DEPLOYMENT_URL from now on

            $ vercel logs DEPLOYMENT_URL

          - Print all runtime logs for the deployment DEPLOYMENT_ID as json objects

            $ vercel logs DEPLOYMENT_ID --json

          - Filter runtime logs for warning with JQ third party tool

            $ vercel logs DEPLOYMENT_ID --json | jq 'select(.level == "warning")'

        "
      `);
    });

    it('prints error when not providing deployement id or url', async () => {
      client.setArgv('logs');
      const exitCode = await logs(client);
      const output = client.getFullOutput();
      expect(exitCode).toEqual(1);
      expect(output).toContain(
        '`vercel logs <deployment>` expects exactly one argument'
      );
    });

    it('prints error when deployment not found', async () => {
      client.setArgv('logs', 'bad.com');
      await expect(logs(client)).rejects.toThrow(
        `Can't find the deployment "bad.com" under the context "${user.username}"`
      );
    });

    it('prints error when argument parsing failed', async () => {
      client.setArgv('logs', '--unknown');
      expect(await logs(client)).toEqual(1);
      expect(client.stderr).toOutput(
        'Error: unknown or unexpected option: --unknown'
      );
    });

    it.each([
      { state: 'QUEUED', withDisclaimer: true },
      { state: 'BUILDING', withDisclaimer: true },
      { state: 'INITIALIZING', withDisclaimer: true },
      { state: 'DEPLOYING', withDisclaimer: false },
      { state: 'ERROR', withDisclaimer: false },
      { state: 'CANCELED', withDisclaimer: false },
    ] as {
      state: Deployment['readyState'];
      withDisclaimer: boolean;
    }[])(
      'prints disclaimer when deployment is $state',
      async ({ state, withDisclaimer }) => {
        const deployment = useDeployment({ creator: user, state });
        client.setArgv('logs', deployment.url);
        const exitCode = await logs(client);
        const output = client.getFullOutput();
        expect(output).toContain(
          `Fetching deployment "${deployment.url}" in ${user.username}`
        );
        expect(output).toContain(
          `Error: Deployment not ready. Currently: ${stateString(state)}.`
        );
        if (withDisclaimer) {
          expect(output).toContain(
            `To follow build logs, run \`vercel inspect --logs --wait ${deployment.url}\``
          );
        }
        expect(exitCode).toEqual(1);
      }
    );

    it('prints disclaimer for deprecated flags', async () => {
      useRuntimeLogs({
        deployment,
        logProducer: async function* () {
          for (const log of logsFixtures) {
            yield log;
          }
        },
      });
      client.setArgv(
        'logs',
        deployment.url,
        `--follow=true`,
        '--since=forever',
        '--until=tomorrow',
        '--limit=1000',
        '--output=short'
      );
      const exitCode = await logs(client);
      expect(exitCode).toEqual(0);
      const output = client.getFullOutput();
      expect(output).toContain(
        `The "--follow" option was ignored because it is now deprecated. Please remove it`
      );
      expect(output).toContain(
        `The "--limit" option was ignored because it is now deprecated. Please remove it`
      );
      expect(output).toContain(
        `The "--since" option was ignored because it is now deprecated. Please remove it`
      );
      expect(output).toContain(
        `The "--until" option was ignored because it is now deprecated. Please remove it`
      );
      expect(output).toContain(
        `The "--output" option was ignored because it is now deprecated. Please remove it`
      );
    });

    it('should track redacted deployment ID/URL positional argument', async () => {
      useRuntimeLogs({
        spy: runtimeEndpointSpy,
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

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:urlOrDeploymentId',
          value: '[REDACTED]',
        },
      ]);
    });

    it('pretty prints log lines', async () => {
      useRuntimeLogs({
        spy: runtimeEndpointSpy,
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
      expect(runtimeEndpointSpy).toHaveBeenCalledWith(
        `/v1/projects/${deployment.projectId}/deployments/${deployment.id}/runtime-logs`,
        { format: 'lines' }
      );
      expect(runtimeEndpointSpy).toHaveBeenCalledOnce();
      await expect(client.stderr).toOutput(
        `Fetching deployment "${deployment.url}" in ${user.username}
`
      );
      const output = client.getFullOutput();
      // 3nd line is time dependent and others are blank lines
      expect(output.split('\n').slice(3).join('\n')).toMatchInlineSnapshot(`
        "waiting for new logs...
        15:01:10.33  ℹ️  GET  200  acme.com     /
        -----------------------------------------
        Hello, world!

        waiting for new logs...
        15:01:10.54  ℹ️  OPTION  204  acme.com     /logout
        --------------------------------------------------
        Bye...

        waiting for new logs...
        "
      `);
      expect(client.stdout.getFullOutput()).toEqual('');
    });

    it('prints log lines in json', async () => {
      useRuntimeLogs({
        spy: runtimeEndpointSpy,
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
      expect(runtimeEndpointSpy).toHaveBeenCalledWith(
        `/v1/projects/${deployment.projectId}/deployments/${deployment.id}/runtime-logs`,
        { format: 'lines' }
      );
      expect(runtimeEndpointSpy).toHaveBeenCalledOnce();
      await expect(client.stderr).toOutput(
        `Fetching deployment "${deployment.url}" in ${user.username}
`
      );
      expect(client.stdout.getFullOutput())
        .toContain(`{"rowId":1,"timestampInMs":1717426870339,"level":"info","message":"Hello, world!","messageTruncated":false,"domain":"acme.com","requestMethod":"GET","requestPath":"/","responseStatusCode":200}
{"rowId":2,"timestampInMs":1717426870540,"message":"Bye...","messageTruncated":false,"domain":"acme.com","requestMethod":"OPTION","requestPath":"/logout","responseStatusCode":204}`);
    });

    it('stops when receiving "limit exceeded" delimiter from server', async () => {
      useRuntimeLogs({
        spy: runtimeEndpointSpy,
        deployment,
        logProducer: async function* () {
          yield {
            message: `Exceeded runtime logs limit 3 log lines`,
            messageTruncated: false,
            source: 'delimiter',
            level: 'error',
            rowId: '',
            domain: '',
            timestampInMs: Date.now(),
            requestMethod: '',
            requestPath: '',
            responseStatusCode: 0,
          };
          yield logsFixtures[0];
        },
      });
      client.setArgv('logs', deployment.url);
      const exitCode = await logs(client);
      expect(exitCode).toEqual(1);
      expect(runtimeEndpointSpy).toHaveBeenCalledWith(
        `/v1/projects/${deployment.projectId}/deployments/${deployment.id}/runtime-logs`,
        { format: 'lines' }
      );
      await expect(client.stderr).toOutput(
        `Fetching deployment "${deployment.url}" in ${user.username}
`
      );
      expect(client.getFullOutput()).toContain(
        `WARN! Exceeded runtime logs limit 3 log lines`
      );
    });

    it(`aborts the command after ${CommandTimeout}`, async () => {
      useRuntimeLogs({
        spy: runtimeEndpointSpy,
        deployment,
        logProducer: async function* () {
          yield logsFixtures[0];
          await promisify(setTimeout)(100);
          vi.runAllTimers();
          yield logsFixtures[1];
        },
      });
      client.setArgv('logs', deployment.url);
      const exitCode = await logs(client);
      expect(exitCode).toEqual(1);
      expect(runtimeEndpointSpy).toHaveBeenCalledWith(
        `/v1/projects/${deployment.projectId}/deployments/${deployment.id}/runtime-logs`,
        { format: 'lines' }
      );
      await expect(client.stderr).toOutput(
        `Fetching deployment "${deployment.url}" in ${user.username}
`
      );
      expect(client.getFullOutput()).toContain(
        `WARN! Command automatically interrupted after ${CommandTimeout}.`
      );
    });

    it('does not retry on a server validation error', async () => {
      const spy = vi.fn();
      client.scenario.get(
        `/v1/projects/${deployment.projectId}/deployments/${deployment.id}/runtime-logs`,
        async (req, res) => {
          spy(req.path, req.query);
          res.statusCode = 400;
          return res.json({
            error: { code: 'bad_request', message: 'Limit exceeded' },
          });
        }
      );
      client.setArgv('logs', deployment.url);
      await expect(logs(client)).rejects.toThrow(`Limit exceeded (400)`);
      expect(spy).toHaveBeenCalledOnce();
    });

    it.each([
      { title: 'as text', flag: '', getOutput: () => client.getFullOutput() },
      {
        title: 'as json',
        flag: '-j',
        getOutput: () => client.stdout.getFullOutput(),
      },
    ])(
      'retries on server error when reading logs $title',
      async ({ flag, getOutput }) => {
        vi.useRealTimers();
        const spy = vi.fn();
        let count = 0;
        client.scenario.get(
          `/v1/projects/${deployment.projectId}/deployments/${deployment.id}/runtime-logs`,
          async (req, res) => {
            spy(req.path, req.query);
            if (count++ < 2) {
              res.statusCode = 500;
              return res.json({
                error: { code: 'server_error', message: `I'm full` },
              });
            }
            res.write(JSON.stringify(logsFixtures[0]) + '\n');
            res.end();
          }
        );
        client.setArgv('logs', deployment.url, flag);
        const exitCode = await logs(client);
        expect(exitCode).toEqual(0);
        await expect(client.stderr).toOutput(
          `Fetching deployment "${deployment.url}" in ${user.username}
`
        );
        expect(getOutput()).toContain(logsFixtures[0].message);
        expect(spy).toHaveBeenCalledWith(
          `/v1/projects/${deployment.projectId}/deployments/${deployment.id}/runtime-logs`,
          { format: 'lines' }
        );
        expect(spy).toHaveBeenCalledTimes(3);
      },
      8000
    );

    it.each([
      { title: 'as text', flag: '', getOutput: () => client.getFullOutput() },
      {
        title: 'as json',
        flag: '-j',
        getOutput: () => client.stdout.getFullOutput(),
      },
    ])(
      'resumes showing logs when failing to process a log line $title',
      async ({ flag, getOutput }) => {
        vi.useRealTimers();
        const spy = vi.fn();
        let count = 0;
        client.scenario.get(
          `/v1/projects/${deployment.projectId}/deployments/${deployment.id}/runtime-logs`,
          async (req, res) => {
            spy(req.path, req.query);
            await promisify(setTimeout)(100);
            res.write(JSON.stringify(logsFixtures[count]) + '\n');
            if (count++ === 0) {
              res.write('unparseable\n');
              await promisify(setTimeout)(100);
              res.destroy(new Error('boom'));
            } else {
              res.end();
            }
          }
        );
        client.setArgv('logs', deployment.url, flag);
        const exitCode = await logs(client);
        expect(exitCode).toEqual(0);
        await expect(client.stderr).toOutput(
          `Fetching deployment "${deployment.url}" in ${user.username}
`
        );
        expect(getOutput()).toContain(logsFixtures[0].message);
        expect(getOutput()).toContain(logsFixtures[1].message);
        expect(spy).toHaveBeenCalledWith(
          `/v1/projects/${deployment.projectId}/deployments/${deployment.id}/runtime-logs`,
          { format: 'lines' }
        );
        expect(spy).toHaveBeenCalledTimes(2);
      }
    );

    describe('--json', () => {
      it('should track usage of `--json` flag', async () => {
        useRuntimeLogs({
          spy: runtimeEndpointSpy,
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

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'argument:urlOrDeploymentId',
            value: '[REDACTED]',
          },
          {
            key: 'flag:json',
            value: 'TRUE',
          },
        ]);
      });
    });

    describe('--follow', () => {
      it('should track usage of `--follow` flag', async () => {
        useRuntimeLogs({
          spy: runtimeEndpointSpy,
          deployment,
          logProducer: async function* () {
            for (const log of logsFixtures) {
              yield log;
            }
          },
        });
        client.setArgv('logs', deployment.url, '--follow');
        const exitCode = await logs(client);
        expect(exitCode).toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'argument:urlOrDeploymentId',
            value: '[REDACTED]',
          },
          {
            key: 'flag:follow',
            value: 'TRUE',
          },
        ]);
      });
    });

    describe('--limit', () => {
      it('should track redacted usage of `--limit` flag', async () => {
        useRuntimeLogs({
          spy: runtimeEndpointSpy,
          deployment,
          logProducer: async function* () {
            for (const log of logsFixtures) {
              yield log;
            }
          },
        });
        client.setArgv('logs', deployment.url, '--limit', '10');
        const exitCode = await logs(client);
        expect(exitCode).toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'argument:urlOrDeploymentId',
            value: '[REDACTED]',
          },
          {
            key: 'option:limit',
            value: '[REDACTED]',
          },
        ]);
      });
    });

    describe('--since', () => {
      it('should track redacted usage of `--since` flag', async () => {
        useRuntimeLogs({
          spy: runtimeEndpointSpy,
          deployment,
          logProducer: async function* () {
            for (const log of logsFixtures) {
              yield log;
            }
          },
        });
        client.setArgv(
          'logs',
          deployment.url,
          '--since',
          '2024-10-25T19:51:14.304Z'
        );
        const exitCode = await logs(client);
        expect(exitCode).toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'argument:urlOrDeploymentId',
            value: '[REDACTED]',
          },
          {
            key: 'option:since',
            value: '[REDACTED]',
          },
        ]);
      });
    });

    describe('--until', () => {
      it('should track redacted usage of `--until` flag', async () => {
        useRuntimeLogs({
          spy: runtimeEndpointSpy,
          deployment,
          logProducer: async function* () {
            for (const log of logsFixtures) {
              yield log;
            }
          },
        });
        client.setArgv(
          'logs',
          deployment.url,
          '--until',
          '2024-10-25T19:51:14.304Z'
        );
        const exitCode = await logs(client);
        expect(exitCode).toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'argument:urlOrDeploymentId',
            value: '[REDACTED]',
          },
          {
            key: 'option:until',
            value: '[REDACTED]',
          },
        ]);
      });
    });

    describe('--output', () => {
      it('should track usage of `--output` flag with known value', async () => {
        useRuntimeLogs({
          spy: runtimeEndpointSpy,
          deployment,
          logProducer: async function* () {
            for (const log of logsFixtures) {
              yield log;
            }
          },
        });
        client.setArgv('logs', deployment.url, '--output', 'raw');
        const exitCode = await logs(client);
        expect(exitCode).toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'argument:urlOrDeploymentId',
            value: '[REDACTED]',
          },
          {
            key: 'option:output',
            value: 'raw',
          },
        ]);
      });

      it('should track redacted usage of `--output` flag with unknown value', async () => {
        useRuntimeLogs({
          spy: runtimeEndpointSpy,
          deployment,
          logProducer: async function* () {
            for (const log of logsFixtures) {
              yield log;
            }
          },
        });
        client.setArgv('logs', deployment.url, '--output', 'other');
        const exitCode = await logs(client);
        expect(exitCode).toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'argument:urlOrDeploymentId',
            value: '[REDACTED]',
          },
          {
            key: 'option:output',
            value: '[REDACTED]',
          },
        ]);
      });
    });
  });
});
