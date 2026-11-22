import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'path';
import { streamToBuffer } from '@vercel/build-utils';
import fs from 'fs-extra';
import { client } from '../../../mocks/client';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import deploy from '../../../../src/commands/deploy';
import { prepareContinuation } from '../../../../src/util/describe/prepare-continuation';
import { prepareFunctions } from '../../../../src/util/describe/prepare-functions';
import { validateBuildOutput } from '../../../../src/util/describe/validate-build-output';
import { readFunctions } from '../../../../src/util/describe/vendor/build-container/container/src/utils/build-output-api/functions/read-functions';

const deploymentId = 'dpl_abc123';
const awsAccountId = '123456789012';
const teamId = 'team_describe';
const DEPRECATED_MESSAGE = '--id is deprecated. Use --deployment.';

async function linkProject(cwd: string) {
  await fs.outputJSON(join(cwd, '.vercel/project.json'), {
    orgId: teamId,
    projectId: 'prj_describe',
    settings: {},
  });
}

async function writeBuildOutput(cwd: string) {
  await fs.outputJSON(join(cwd, '.vercel/output/config.json'), {
    version: 3,
  });
  await fs.outputFile(join(cwd, '.vercel/output/static/index.html'), 'hi');
}

async function writeFunctionOutput(
  cwd: string,
  directory: string,
  config: Record<string, unknown> = {}
) {
  const target = join(cwd, '.vercel/output', directory);
  await fs.outputJSON(join(target, '.vc-config.json'), {
    runtime: 'nodejs22.x',
    handler: 'index.js',
    ...config,
  });
  await fs.outputFile(join(target, 'index.js'), 'exports.handler = () => {};');
}

function mockEnvPull() {
  client.scenario.get(`/v3/env/pull/${deploymentId}`, (_req, res) => {
    res.json({
      env: {},
      buildEnv: {
        VERCEL_ENCRYPTED_ENV_FILENAME: '___vc_env',
        VERCEL_ENCRYPTED_ENV_CONTENT: Buffer.from('env').toString('base64'),
      },
    });
  });
}

describe('deploy describe', () => {
  const realPlatform = process.platform;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process, 'platform', {
      value: realPlatform,
      configurable: true,
    });
  });

  describe('arguments', () => {
    it('requires --deployment', async () => {
      client.setArgv('deploy', 'describe', '--aws-account-id', awsAccountId);
      await expect(deploy(client)).resolves.toBe(2);
      await expect(client.stderr).toOutput(
        'Provide a deployment ID with --deployment'
      );
    });

    it('rejects a malformed deployment id', async () => {
      client.setArgv(
        'deploy',
        'describe',
        '--deployment',
        'abc',
        '--aws-account-id',
        awsAccountId
      );
      await expect(deploy(client)).resolves.toBe(2);
    });

    it('requires a 12-digit AWS account id', async () => {
      client.setArgv(
        'deploy',
        'describe',
        '--deployment',
        deploymentId,
        '--aws-account-id',
        '1'
      );
      await expect(deploy(client)).resolves.toBe(2);
      await expect(client.stderr).toOutput(
        'Provide a 12-digit AWS account ID with --aws-account-id.'
      );
    });

    it('rejects positional arguments', async () => {
      client.setArgv(
        'deploy',
        'describe',
        'extra',
        '--deployment',
        deploymentId,
        '--aws-account-id',
        awsAccountId
      );
      await expect(deploy(client)).resolves.toBe(2);
      await expect(client.stderr).toOutput('Unexpected positional arguments');
    });

    it('rejects unknown options', async () => {
      client.setArgv('deploy', 'describe', '--nope');
      await expect(deploy(client)).resolves.toBe(2);
    });

    it('rejects --deployment with its deprecated name --id', async () => {
      client.setArgv(
        'deploy',
        'describe',
        '--deployment',
        deploymentId,
        '--id',
        deploymentId,
        '--aws-account-id',
        awsAccountId,
        '--json'
      );
      await expect(deploy(client)).resolves.toBe(2);
      expect(client.stdout.getFullOutput()).toBe('');
      expect(JSON.parse(client.stderr.getFullOutput().trim())).toEqual({
        status: 'error',
        reason: 'invalid_arguments',
        message: "Can't use --deployment with --id.",
      });
    });

    it('rejects an empty --deployment', async () => {
      client.setArgv(
        'deploy',
        'describe',
        '--deployment=',
        '--aws-account-id',
        awsAccountId
      );
      await expect(deploy(client)).resolves.toBe(2);
      await expect(client.stderr).toOutput("--deployment can't be empty.");
    });

    it('writes a JSON error document with --json', async () => {
      client.setArgv('deploy', 'describe', '--json');
      await expect(deploy(client)).resolves.toBe(2);
      expect(JSON.parse(client.stderr.getFullOutput().trim())).toMatchObject({
        status: 'error',
        reason: 'invalid_arguments',
      });
    });
  });

  it('prints subcommand help', async () => {
    client.setArgv('deploy', 'describe', '--help');
    await expect(deploy(client)).resolves.toBe(0);
    await expect(client.stderr).toOutput('vercel deploy describe');
  });

  it('is not supported on Windows', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    });
    client.setArgv(
      'deploy',
      'describe',
      '--deployment',
      deploymentId,
      '--aws-account-id',
      awsAccountId
    );
    await expect(deploy(client)).resolves.toBe(1);
    await expect(client.stderr).toOutput('not supported on Windows');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:describe', value: 'describe' },
    ]);
  });

  describe.skipIf(process.platform === 'win32')('preparation', () => {
    let cwd: string;

    beforeEach(async () => {
      cwd = setupTmpDir();
      await linkProject(cwd);
      client.cwd = cwd;
      client.setArgv(
        'deploy',
        'describe',
        '--deployment',
        deploymentId,
        '--aws-account-id',
        awsAccountId
      );
    });

    it('requires a local build', async () => {
      await expect(deploy(client)).resolves.toBe(1);
      await expect(client.stderr).toOutput(
        `Run \`vercel build --deployment ${deploymentId}\` before \`vercel deploy describe\`.`
      );
    });

    it('explains a 404 from the deployment API', async () => {
      await writeBuildOutput(cwd);
      client.scenario.get(`/v3/env/pull/${deploymentId}`, (_req, res) => {
        res.status(404).json({
          error: { code: 'not_found', message: 'Not Found' },
        });
      });

      await expect(deploy(client)).resolves.toBe(1);
      await expect(client.stderr).toOutput(
        'or manual provisioning is not enabled for this team'
      );
    });

    it('shows API validation errors', async () => {
      await writeBuildOutput(cwd);
      mockEnvPull();
      client.scenario.post(
        `/v2/deployments/${deploymentId}/builds/function-descriptors`,
        (_req, res) => {
          res.status(400).json({
            error: {
              code: 'bad_request',
              message: 'Deployment is in READY state, expected INITIALIZING.',
            },
          });
        }
      );

      await expect(deploy(client)).resolves.toBe(1);
      await expect(client.stderr).toOutput(
        'Deployment is in READY state, expected INITIALIZING.'
      );
    });

    it('keeps --json stderr to one error document while integrations are pending', async () => {
      // Skip the integrations poll interval without faking the mock server's timers.
      const realSetTimeout = globalThis.setTimeout;
      vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
        fn: () => void,
        ms?: number
      ) => realSetTimeout(fn, ms === 5000 ? 0 : ms)) as typeof setTimeout);

      await writeBuildOutput(cwd);
      let envPulls = 0;
      client.scenario.get(`/v3/env/pull/${deploymentId}`, (_req, res) => {
        if (envPulls++ === 0) {
          return res.status(400).json({
            error: {
              code: 'deployment_not_ready_integrations_pending',
              message: 'Deployment integrations are still provisioning.',
              integrationsStatus: 'pending',
            },
          });
        }
        res.json({
          env: {},
          buildEnv: {
            VERCEL_ENCRYPTED_ENV_FILENAME: '___vc_env',
            VERCEL_ENCRYPTED_ENV_CONTENT: Buffer.from('env').toString('base64'),
          },
        });
      });
      client.scenario.post(
        `/v2/deployments/${deploymentId}/builds/function-descriptors`,
        (_req, res) => {
          res.status(400).json({
            error: {
              code: 'bad_request',
              message: 'Deployment is not pending manual provisioning.',
            },
          });
        }
      );
      client.setArgv(
        'deploy',
        'describe',
        '--deployment',
        deploymentId,
        '--aws-account-id',
        awsAccountId,
        '--json'
      );

      await expect(deploy(client)).resolves.toBe(1);
      expect(envPulls).toBe(2);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).not.toContain('Waiting for deployment integrations');
      expect(JSON.parse(stderr.trim())).toEqual({
        status: 'error',
        reason: 'api_error',
        message: 'Deployment is not pending manual provisioning.',
      });
    });

    it('describes root and service functions and preserves their continuation on retry', async () => {
      const outputDir = join(cwd, '.vercel/output');
      const services = ['web', 'agent'].map(name => ({
        schema: 'experimentalServicesV2',
        name,
        root: name,
        builder: { use: '@vercel/node' },
      }));
      await fs.outputJSON(join(outputDir, 'config.json'), {
        version: 3,
        experimentalServicesV2: {
          web: {},
          agent: {},
          skipped: { root: 'skipped' },
        },
        services,
        routes: [
          { src: '/agent', destination: { service: 'agent', type: 'service' } },
        ],
      });
      await fs.outputJSON(join(cwd, 'package.json'), { name: 'project' });
      await fs.outputJSON(join(cwd, 'web/package.json'), { name: 'web' });
      await writeFunctionOutput(cwd, 'functions/index.func');
      for (const service of ['web', 'agent']) {
        await fs.outputJSON(
          join(outputDir, 'services', service, 'config.json'),
          {
            version: 3,
            cleanUrls: true,
            routes:
              service === 'web'
                ? [{ src: '/.*', middlewarePath: '/index' }]
                : [],
          }
        );
        await writeFunctionOutput(
          cwd,
          `services/${service}/functions/index.func`,
          {
            filePathMap: { 'package.json': 'web/package.json' },
          }
        );
      }
      const webFunctions = join(outputDir, 'services/web/functions');
      await fs.mkdirp(join(webFunctions, 'nested'));
      await fs.symlink(
        '../index.func',
        join(webFunctions, 'nested/alias.func')
      );
      await fs.outputJSON(
        join(webFunctions, 'nested/alias.prerender-config.json'),
        {
          expiration: 60,
          fallback: 'alias.fallback.html',
        }
      );
      await fs.outputFile(
        join(webFunctions, 'nested/alias.fallback.html'),
        '<p>Fallback</p>'
      );
      await fs.outputFile(
        join(outputDir, 'services/web/static/index.html'),
        'web'
      );
      mockEnvPull();
      const requests: {
        path: string;
        service?: string;
        sourceKind: string;
        lambda: { digest: string };
      }[][] = [];
      client.scenario.post(
        `/v2/deployments/${deploymentId}/builds/function-descriptors`,
        (req, res) => {
          expect(req.body.services).toEqual(services);
          requests.push(req.body.lambdas);
          res.json({
            descriptors: req.body.lambdas.map(
              (input: { service?: string; lambda: { digest: string } }) => [
                {
                  FunctionName: `function-${input.lambda.digest}`,
                  Environment: { Variables: {} },
                  Handler: 'index.handler',
                  Layers: [],
                  MemorySize: 1024,
                  Region: 'iad1',
                  ResolvableLayers: {},
                  Runtime: 'nodejs22.x',
                  Tags: {},
                },
              ]
            ),
          });
        }
      );

      await expect(deploy(client)).resolves.toBe(0);
      expect(requests[0]).toHaveLength(4);
      expect(requests[0]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'index', sourceKind: 'lambda' }),
          expect.objectContaining({
            path: 'services/web/index',
            service: 'web',
            sourceKind: 'lambda',
            middleware: {},
          }),
          expect.objectContaining({
            path: 'services/web/nested/alias',
            service: 'web',
            sourceKind: 'prerender',
          }),
          expect.objectContaining({
            path: 'services/agent/index',
            service: 'agent',
            sourceKind: 'lambda',
          }),
        ])
      );
      for (const input of requests[0]) {
        expect(input).not.toHaveProperty('directory');
        if (input.path !== 'services/web/index') {
          expect(input).not.toHaveProperty('middleware');
        }
      }
      const manifest = await fs.readJSON(join(outputDir, 'provision.json'));
      expect(Object.keys(manifest).sort()).toEqual([
        'index',
        'services/agent/index',
        'services/web/index',
        'services/web/nested/alias',
      ]);
      expect(manifest['services/web/nested/alias']).toEqual(
        manifest['services/web/index']
      );
      const artifacts = join(cwd, '.vercel', deploymentId);
      const descriptor = await fs.readJSON(join(artifacts, 'descriptor.json'));
      expect(descriptor.functions).toHaveLength(2);
      expect(manifest['services/agent/index']).toEqual(
        manifest['services/web/index']
      );
      for (const fn of descriptor.functions) {
        expect(await fs.pathExists(join(artifacts, fn.code))).toBe(true);
      }
      expect(
        await fs.pathExists(join(webFunctions, 'index.func/index.js'))
      ).toBe(false);
      expect(
        await fs.pathExists(
          join(artifacts, 'build/services/web/functions/index.func/index.js')
        )
      ).toBe(true);
      expect(
        await fs.readJSON(join(webFunctions, 'index.func/.vc-config.json'))
      ).not.toHaveProperty('filePathMap');
      expect(
        (
          await fs.lstat(join(webFunctions, 'nested/alias.func'))
        ).isSymbolicLink()
      ).toBe(true);
      const functions = await readFunctions({
        outputDir: join(outputDir, 'services/web'),
        repoRootPath: cwd,
        prebuilt: true,
      });
      expect(functions.prerenders.get('nested/alias')?.lambda).toBe(
        functions.lambdas.get('index')
      );
      expect(functions.prerenders.get('nested/alias')?.expiration).toBe(60);
      expect(
        (
          await streamToBuffer(
            functions.prerenders.get('nested/alias')!.fallback!.toStream()
          )
        ).toString()
      ).toBe('<p>Fallback</p>');
      expect(
        await fs.readFile(
          join(outputDir, 'services/web/static/index.html'),
          'utf8'
        )
      ).toBe('web');
      const security = join(
        outputDir,
        'functions/index.func/__byoc_security__'
      );
      const packages = await Promise.all(
        (await fs.readdir(security)).map(
          async name =>
            (await fs.readJSON(join(security, name, 'package.json'))).name
        )
      );
      expect(packages.sort()).toEqual(['project', 'web']);

      await expect(deploy(client)).resolves.toBe(0);
      expect(requests[1]).toEqual(requests[0]);
      expect(await fs.readJSON(join(outputDir, 'provision.json'))).toEqual(
        manifest
      );
      const retriedFunctions = await readFunctions({
        outputDir: join(outputDir, 'services/web'),
        repoRootPath: cwd,
        prebuilt: true,
      });
      expect(
        (
          await streamToBuffer(
            retriedFunctions.prerenders
              .get('nested/alias')!
              .fallback!.toStream()
          )
        ).toString()
      ).toBe('<p>Fallback</p>');
    });

    it('resolves middleware before checking native function compute', async () => {
      await fs.outputJSON(join(cwd, '.vercel/output/config.json'), {
        version: 3,
        routes: [{ src: '/.*', middlewarePath: 'missing' }],
      });
      await writeFunctionOutput(cwd, 'functions/index.func', {
        runtime: 'container',
      });

      await expect(
        prepareFunctions({
          directory: cwd,
          outputDir: join(cwd, '.vercel/output'),
          repoRootPath: cwd,
        })
      ).rejects.toMatchObject({ code: 'middleware_path_not_found' });
    });

    it.each([
      { runtime: 'container' },
      { runtime: 'edge' },
      { hive: { enabled: true } },
      { affinity: { mode: 'strict' } },
    ])('rejects unsupported service compute %j before requesting descriptors', async config => {
      const outputDir = join(cwd, '.vercel/output');
      await fs.outputJSON(join(outputDir, 'config.json'), {
        version: 3,
        experimentalServicesV2: { agent: {} },
      });
      await fs.outputJSON(join(outputDir, 'services/agent/config.json'), {
        version: 3,
      });
      await writeFunctionOutput(
        cwd,
        'services/agent/functions/index.func',
        config
      );
      let requests = 0;
      client.scenario.get(`/v3/env/pull/${deploymentId}`, (_req, res) => {
        requests++;
        res.status(500).end();
      });
      client.setArgv(
        'deploy',
        'describe',
        '--deployment',
        deploymentId,
        '--aws-account-id',
        awsAccountId,
        '--json'
      );
      await expect(deploy(client)).resolves.toBe(1);
      expect(JSON.parse(client.stderr.getFullOutput().trim())).toMatchObject({
        reason: 'unsupported_output',
      });
      expect(requests).toBe(0);
      expect(
        await fs.pathExists(
          join(outputDir, 'services/agent/functions/index.func/index.js')
        )
      ).toBe(true);
      expect(await fs.pathExists(join(outputDir, 'provision.json'))).toBe(
        false
      );
    });

    it.each([
      { experimentalServicesV2: { agent: {} }, reason: 'invalid_build_output' },
      {
        experimentalServicesV2: {
          agent: {
            root: 'agent',
            bindings: [
              { type: 'service', service: 'web', env: 'WEB', format: 'url' },
            ],
          },
        },
        reason: 'unsupported_output',
      },
      {
        experimentalServicesV2: { 'invalid/name': {} },
        reason: 'invalid_build_output',
      },
      { daemons: { worker: {} }, reason: 'unsupported_output' },
    ])('rejects unsupported or incomplete service inventory %j', async ({
      reason,
      ...config
    }) => {
      await fs.outputJSON(join(cwd, '.vercel/output/config.json'), {
        version: 3,
        ...config,
      });
      client.setArgv(
        'deploy',
        'describe',
        '--deployment',
        deploymentId,
        '--aws-account-id',
        awsAccountId,
        '--json'
      );
      await expect(deploy(client)).resolves.toBe(1);
      expect(JSON.parse(client.stderr.getFullOutput().trim())).toMatchObject({
        reason,
      });
    });

    it('does not skip invalid service output when the service has a source root', async () => {
      const outputDir = join(cwd, '.vercel/output');
      await fs.outputJSON(join(outputDir, 'config.json'), {
        version: 3,
        experimentalServicesV2: { agent: { root: 'agent' } },
      });
      await fs.outputJSON(join(outputDir, 'services/agent/config.json'), {
        version: 2,
      });
      let envRequests = 0;
      client.scenario.get(`/v3/env/pull/${deploymentId}`, (_req, res) => {
        envRequests++;
        res.status(500).end();
      });

      await expect(deploy(client)).resolves.toBe(1);
      expect(envRequests).toBe(0);
      expect(
        await fs.readJSON(join(outputDir, 'services/agent/config.json'))
      ).toEqual({ version: 2 });
      expect(await fs.pathExists(join(outputDir, 'provision.json'))).toBe(
        false
      );
    });

    it('rejects a root function colliding with a service-qualified path', async () => {
      const outputDir = join(cwd, '.vercel/output');
      await fs.outputJSON(join(outputDir, 'config.json'), {
        version: 3,
        experimentalServicesV2: { agent: {} },
      });
      await fs.outputJSON(join(outputDir, 'services/agent/config.json'), {
        version: 3,
      });
      await writeFunctionOutput(cwd, 'functions/services/agent/index.func');
      await writeFunctionOutput(cwd, 'services/agent/functions/index.func');
      await expect(deploy(client)).resolves.toBe(1);
      await expect(client.stderr).toOutput(
        'Multiple function outputs use "services/agent/index"'
      );
    });

    it('prepares a continuation and reuses the preserved build on retry', async () => {
      await writeBuildOutput(cwd);
      mockEnvPull();
      let teamQuery: unknown;
      client.scenario.post(
        `/v2/deployments/${deploymentId}/builds/function-descriptors`,
        (req, res) => {
          teamQuery = req.query.teamId;
          res.json({ descriptors: [] });
        }
      );

      await expect(deploy(client)).resolves.toBe(0);
      expect(teamQuery).toBe(teamId);

      const artifacts = join(cwd, '.vercel', deploymentId);
      expect(await fs.readJSON(join(artifacts, 'descriptor.json'))).toEqual({
        awsAccountId,
        deploymentId,
        functions: [],
        layers: {},
        version: 1,
      });
      expect(await fs.pathExists(join(artifacts, 'build/config.json'))).toBe(
        true
      );
      expect(
        await fs.readJSON(join(cwd, '.vercel/output/provision.json'))
      ).toEqual({});

      await expect(deploy(client)).resolves.toBe(0);
      expect(await fs.pathExists(join(artifacts, 'build/config.json'))).toBe(
        true
      );
      expect(
        await fs.readFile(join(cwd, '.vercel/output/static/index.html'), 'utf8')
      ).toBe('hi');
    });

    describe('deployment option', () => {
      function mockDescriptors() {
        mockEnvPull();
        client.scenario.post(
          `/v2/deployments/${deploymentId}/builds/function-descriptors`,
          (_req, res) => {
            res.json({ descriptors: [] });
          }
        );
      }

      function optionEvents() {
        return client.telemetryEventStore.readonlyEvents
          .map(event => event.key)
          .filter(key => key === 'option:deployment' || key === 'option:id');
      }

      it('teaches --deployment in the next step without a warning', async () => {
        await writeBuildOutput(cwd);
        mockDescriptors();

        await expect(deploy(client)).resolves.toBe(0);
        const stderr = client.stderr.getFullOutput();
        expect(stderr).toContain(
          `vercel deploy continue --deployment ${deploymentId}`
        );
        expect(stderr).not.toContain('--id');
        expect(stderr).not.toContain('deprecated');
        expect(optionEvents()).toEqual(['option:deployment']);
      });

      it('still accepts the deprecated --id with a warning', async () => {
        await writeBuildOutput(cwd);
        mockDescriptors();
        client.setArgv(
          'deploy',
          'describe',
          '--id',
          deploymentId,
          '--aws-account-id',
          awsAccountId
        );

        await expect(deploy(client)).resolves.toBe(0);
        expect(client.stdout.getFullOutput()).toBe(
          `${join(cwd, '.vercel', deploymentId, 'descriptor.json')}\n`
        );
        const stderr = client.stderr.getFullOutput();
        expect(stderr).toContain(`! ${DEPRECATED_MESSAGE}`);
        expect(stderr).toContain(
          `vercel deploy continue --deployment ${deploymentId}`
        );
        expect(optionEvents()).toEqual(['option:id']);
      });

      it('puts the --id warning in the JSON receipt', async () => {
        await writeBuildOutput(cwd);
        mockDescriptors();
        client.setArgv(
          'deploy',
          'describe',
          '--id',
          deploymentId,
          '--aws-account-id',
          awsAccountId,
          '--json'
        );

        await expect(deploy(client)).resolves.toBe(0);
        expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
          deployment: { id: deploymentId },
          awsAccountId,
          directory: join(cwd, '.vercel', deploymentId),
          descriptor: join(cwd, '.vercel', deploymentId, 'descriptor.json'),
          warnings: [{ reason: 'deprecated', message: DEPRECATED_MESSAGE }],
        });
        expect(client.stderr.getFullOutput()).toBe('');
      });

      it('leaves warnings out of the JSON receipt for --deployment', async () => {
        await writeBuildOutput(cwd);
        mockDescriptors();
        client.setArgv(
          'deploy',
          'describe',
          '--deployment',
          deploymentId,
          '--aws-account-id',
          awsAccountId,
          '--json'
        );

        await expect(deploy(client)).resolves.toBe(0);
        expect(JSON.parse(client.stdout.getFullOutput())).not.toHaveProperty(
          'warnings'
        );
        expect(client.stderr.getFullOutput()).toBe('');
      });

      it('puts the --id warning in the JSON error document', async () => {
        client.setArgv(
          'deploy',
          'describe',
          '--id',
          deploymentId,
          '--aws-account-id',
          awsAccountId,
          '--json'
        );

        await expect(deploy(client)).resolves.toBe(1);
        expect(client.stdout.getFullOutput()).toBe('');
        expect(JSON.parse(client.stderr.getFullOutput().trim())).toEqual({
          status: 'error',
          reason: expect.any(String),
          message: `No local build output found. Run \`vercel build --deployment ${deploymentId}\` before \`vercel deploy describe\`.`,
          warnings: [{ reason: 'deprecated', message: DEPRECATED_MESSAGE }],
        });
      });
    });
  });
});

describe.skipIf(process.platform === 'win32')('prepareContinuation', () => {
  it.each([
    'relative',
    'absolute',
  ])('preserves %s function aliases after relocating the continuation', async linkType => {
    const cwd = setupTmpDir();
    const outputDir = join(cwd, '.vercel/output');
    const functionsDir = join(outputDir, 'functions');
    const target = join(functionsDir, 'shared.func');
    await fs.outputJSON(join(outputDir, 'config.json'), { version: 3 });
    await fs.outputJSON(join(target, '.vc-config.json'), {
      runtime: 'nodejs22.x',
      handler: 'index.js',
    });
    await fs.outputFile(join(target, 'index.js'), 'function code');
    await fs.mkdirp(join(functionsDir, 'nested'));
    await fs.symlink(
      linkType === 'absolute' ? target : '../shared.func',
      join(functionsDir, 'nested/alias.func')
    );
    await fs.symlink('nested/alias.func', join(functionsDir, 'route.func'));
    await fs.outputJSON(
      join(functionsDir, 'nested/alias.prerender-config.json'),
      {
        expiration: 60,
        fallback: null,
      }
    );
    await fs.outputFile(join(outputDir, 'static/index.html'), 'static content');
    await fs.symlink('index.html', join(outputDir, 'static/alias.html'));
    const manifest = { 'nested/alias': {}, route: {}, shared: {} };
    const destination = join(cwd, 'continuation');

    await prepareContinuation({
      directory: cwd,
      outputDir,
      destination,
      manifest,
      functions: Object.keys(manifest).map(path => ({
        directory: `functions/${path}.func`,
      })),
    });
    await fs.remove(outputDir);

    expect(
      (
        await fs.lstat(join(destination, 'functions/nested/alias.func'))
      ).isSymbolicLink()
    ).toBe(true);
    expect(await fs.readJSON(join(destination, 'provision.json'))).toEqual(
      manifest
    );
    expect(
      await fs.pathExists(join(destination, 'functions/shared.func/index.js'))
    ).toBe(false);
    expect(
      await fs.readFile(join(destination, 'static/alias.html'), 'utf8')
    ).toBe('static content');
    const functions = await readFunctions({
      outputDir: destination,
      repoRootPath: cwd,
      prebuilt: true,
    });
    const shared = functions.lambdas.get('shared');
    expect(shared).toBeDefined();
    expect(functions.lambdas.get('route')).toBe(shared);
    expect(functions.prerenders.get('nested/alias')?.lambda).toBe(shared);
    expect(functions.prerenders.get('nested/alias')?.expiration).toBe(60);
  });

  it.each([
    'functions/api.func',
    'services/agent/functions/api.func',
  ])('copies only root and top-level dependency manifests into %s', async functionDirectory => {
    const cwd = setupTmpDir();
    const outputDir = join(cwd, '.vercel/output');
    await fs.outputJSON(join(outputDir, 'config.json'), { version: 3 });
    await fs.outputJSON(join(outputDir, functionDirectory, '.vc-config.json'), {
      runtime: 'nodejs22.x',
      handler: 'index.js',
      launcherType: 'Nodejs',
    });
    await fs.outputFile(join(outputDir, functionDirectory, 'index.js'), '');

    const manifest = (name: string) => ({ name, version: '1.0.0' });
    await fs.outputJSON(join(cwd, 'package.json'), manifest('root'));
    await fs.outputJSON(
      join(cwd, 'node_modules/next/package.json'),
      manifest('next')
    );
    await fs.outputJSON(
      join(cwd, 'node_modules/@scope/pkg/package.json'),
      manifest('@scope/pkg')
    );
    await fs.outputJSON(
      join(cwd, 'node_modules/next/node_modules/nested/package.json'),
      manifest('nested')
    );
    await fs.outputJSON(
      join(cwd, 'node_modules/.pnpm/store@1.0.0/package.json'),
      manifest('store')
    );

    const destination = join(cwd, 'continuation');
    await prepareContinuation({
      directory: cwd,
      repoRootPath: cwd,
      outputDir,
      destination,
      manifest: { api: {} },
      functions: [{ directory: functionDirectory }],
    });

    const func = join(destination, functionDirectory);
    expect(await fs.pathExists(join(func, 'index.js'))).toBe(false);

    const security = join(func, '__byoc_security__');
    const names = await Promise.all(
      (await fs.readdir(security)).map(
        async dir =>
          (await fs.readJSON(join(security, dir, 'package.json'))).name
      )
    );
    expect(names.sort()).toEqual(['@scope/pkg', 'next', 'root']);
  });
});

describe.skipIf(process.platform === 'win32')('validateBuildOutput', () => {
  async function workspaceProject(
    mapped: string,
    {
      project = 'apps/web',
      ignoreIn = project,
    }: { project?: string; ignoreIn?: string } = {}
  ) {
    const root = setupTmpDir();
    const directory = join(root, project);
    const outputDir = join(directory, '.vercel/output');
    await fs.outputFile(join(root, ignoreIn, '.vercelignore'), 'secret.json\n');
    await fs.outputFile(join(directory, 'secret.json'), '{}');
    await fs.outputFile(join(directory, 'public.json'), '{}');
    await fs.outputJSON(join(outputDir, 'config.json'), { version: 3 });
    await fs.outputJSON(join(outputDir, 'functions/api.func/.vc-config.json'), {
      runtime: 'nodejs22.x',
      handler: 'index.js',
      filePathMap: { 'data.json': `${project}/${mapped}` },
    });
    return { directory, outputDir, repoRootPath: root };
  }

  it("rejects files excluded by the project directory's .vercelignore", async () => {
    await expect(
      validateBuildOutput(await workspaceProject('secret.json'))
    ).rejects.toMatchObject({ reason: 'invalid_build_output' });
  });

  it('rejects files excluded by an ignore file between the repo and project', async () => {
    await expect(
      validateBuildOutput(
        await workspaceProject('secret.json', {
          project: 'apps/web/src',
          ignoreIn: 'apps/web',
        })
      )
    ).rejects.toMatchObject({ reason: 'invalid_build_output' });
  });

  it('allows files the project directory does not ignore', async () => {
    await expect(
      validateBuildOutput(await workspaceProject('public.json'))
    ).resolves.toBeTypeOf('function');
  });

  it('rejects an excluded file mapped by one of many functions', async () => {
    const options = await workspaceProject('public.json');
    for (let i = 0; i < 20; i++) {
      await fs.outputJSON(
        join(options.outputDir, `functions/route-${i}.func/.vc-config.json`),
        {
          runtime: 'nodejs22.x',
          handler: 'index.js',
          filePathMap: {
            'data.json': `apps/web/${i === 13 ? 'secret' : 'public'}.json`,
          },
        }
      );
    }
    await expect(validateBuildOutput(options)).rejects.toMatchObject({
      reason: 'invalid_build_output',
    });
  });

  it('rejects a link out of the build output', async () => {
    const options = await workspaceProject('public.json');
    await fs.mkdirp(join(options.outputDir, 'static'));
    await fs.symlink(
      join(options.directory, 'secret.json'),
      join(options.outputDir, 'static/secret.json')
    );
    await expect(validateBuildOutput(options)).rejects.toMatchObject({
      reason: 'invalid_build_output',
    });
  });

  it('rejects a link cycle split across sibling directories', async () => {
    const options = await workspaceProject('public.json');
    await fs.mkdirp(join(options.outputDir, 'static/a'));
    await fs.mkdirp(join(options.outputDir, 'static/b'));
    await fs.symlink('../b', join(options.outputDir, 'static/a/to-b'));
    await fs.symlink('../a', join(options.outputDir, 'static/b/to-a'));
    await expect(validateBuildOutput(options)).rejects.toMatchObject({
      reason: 'invalid_build_output',
    });
  });
});
