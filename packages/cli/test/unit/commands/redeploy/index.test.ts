import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import redeploy from '../../../../src/commands/redeploy';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { useDeployment } from '../../../mocks/deployment';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import type { Deployment } from '@vercel-internals/types';

describe('redeploy', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'redeploy';

      client.setArgv(command, '--help');
      const exitCodePromise = redeploy(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  describe('[url|deploymentId]', () => {
    it('tracks redacted deploymentId|deploymentName', async () => {
      const { fromDeployment, toDeployment } = initRedeployTest();
      toDeployment.readyState = 'QUEUED';
      client.setArgv('rollback', fromDeployment.id);

      const exitCodePromise = redeploy(client);

      toDeployment.readyState = 'READY';
      await expect(exitCodePromise).resolves.toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:urlOrDeploymentId',
          value: '[REDACTED]',
        },
      ]);
    });

    describe('--no-wait', () => {
      it('tracks use of --no-wait', async () => {
        const { fromDeployment, toDeployment } = initRedeployTest();
        toDeployment.readyState = 'QUEUED';
        client.setArgv('rollback', fromDeployment.id, '--no-wait');

        const exitCodePromise = redeploy(client);

        await expect(exitCodePromise).resolves.toEqual(0);
        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'argument:urlOrDeploymentId',
            value: '[REDACTED]',
          },
          {
            key: 'flag:no-wait',
            value: 'TRUE',
          },
        ]);
      });
    });
  });

  it('should error if missing deployment url', async () => {
    client.setArgv('redeploy');
    const exitCodePromise = redeploy(client);

    await expect(client.stderr).toOutput(
      'Missing required deployment id or url:'
    );
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "redeploy"').toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      '`vercel redeploy <deployment>`'
    );
  });

  it('should error if deployment not found', async () => {
    initRedeployTest();
    client.setArgv('redeploy', 'foo');
    const exitCodePromise = redeploy(client);

    await expect(client.stderr).toOutput('Fetching deployment "foo" in ');
    await expect(client.stderr).toOutput(
      'Error: Can\'t find the deployment "foo" under the context'
    );
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "redeploy"').toEqual(1);
  });

  it('should error if deployment belongs to another team', async () => {
    const { fromDeployment } = initRedeployTest();
    fromDeployment.team = {
      id: 'abc',
      name: 'abc',
      slug: 'abc',
    };
    client.setArgv('rollback', fromDeployment.id);
    const exitCodePromise = redeploy(client);

    await expect(client.stderr).toOutput(
      `Fetching deployment "${fromDeployment.id}" in ${fromDeployment.creator?.username}`
    );
    await expect(client.stderr).toOutput(
      'Error: Deployment belongs to a different team'
    );

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "redeploy"').toEqual(1);
  });

  it('should redeploy an existing deployment', async () => {
    const { fromDeployment } = initRedeployTest();
    client.setArgv('rollback', fromDeployment.id);

    const exitCodePromise = redeploy(client);
    await expect(client.stderr).toOutput(
      `Fetching deployment "${fromDeployment.id}" in ${fromDeployment.creator?.username}`
    );
    await expect(client.stderr).toOutput('Production      https');

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "redeploy"').toEqual(0);
  });

  it('should redeploy and not wait for completion', async () => {
    const { fromDeployment, toDeployment } = initRedeployTest();
    toDeployment.readyState = 'QUEUED';
    client.setArgv('rollback', fromDeployment.id, '--no-wait');

    const exitCodePromise = redeploy(client);
    await expect(client.stderr).toOutput(
      `Fetching deployment "${fromDeployment.id}" in ${fromDeployment.creator?.username}`
    );
    await expect(client.stderr).toOutput(
      'Note: Deployment is still processing'
    );

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "redeploy"').toEqual(0);

    // The Aliased row never prints with --no-wait, so the ▲ gutter falls
    // back to the Production row.
    const stderrOutput = client.stderr.getFullOutput();
    expect(stderrOutput).toContain('▲ Production');
  });

  it('should display the ▲ Aliased row when the deployment is already ready and aliased', async () => {
    const { fromDeployment, toDeployment } = initRedeployTest();
    // already READY + aliasAssigned: the status polling loop is skipped
    toDeployment.alias = ['my-app.vercel.app'];
    client.setArgv('redeploy', fromDeployment.id);

    const exitCodePromise = redeploy(client);
    await expect(client.stderr).toOutput(
      'Aliased         https://my-app.vercel.app'
    );

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "redeploy"').toEqual(0);

    const stderrOutput = client.stderr.getFullOutput();
    expect(stderrOutput).not.toContain('▲ Production');
    expect(stderrOutput).toContain('▲ Aliased');
  });

  it('should display the ▲ gutter only on the Aliased row when waiting for aliases', async () => {
    const { fromDeployment, toDeployment } = initRedeployTest();
    toDeployment.readyState = 'BUILDING';
    toDeployment.aliasAssigned = false;
    client.setArgv('redeploy', fromDeployment.id);

    const exitCodePromise = redeploy(client);
    await expect(client.stderr).toOutput('Production      https');

    // let the status poller observe the alias assignment
    toDeployment.readyState = 'READY';
    toDeployment.aliasAssigned = true;
    toDeployment.alias = ['my-app.vercel.app'];

    await expect(client.stderr).toOutput(
      'Aliased         https://my-app.vercel.app'
    );

    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "redeploy"').toEqual(0);

    const stderrOutput = client.stderr.getFullOutput();
    expect(stderrOutput).not.toContain('▲ Production');
    expect(stderrOutput).toContain('▲ Aliased');
  });

  describe('prebuilt deployments', () => {
    const prebuiltWarning = 'is a prebuilt deployment. Redeploying reuses';

    async function runRedeploy(
      configure: (deployment: Deployment) => void = () => {}
    ) {
      const { fromDeployment, toDeployment, postRequests } = initRedeployTest();
      configure(fromDeployment);
      client.stdout.isTTY = false;
      client.setArgv('redeploy', fromDeployment.id);

      const exitCode = await redeploy(client);

      return {
        exitCode,
        fromDeployment,
        toDeployment,
        postRequests,
        stderr: client.stderr.getFullOutput(),
        stdout: client.stdout.getFullOutput(),
      };
    }

    it('warns once and still redeploys a prebuilt deployment', async () => {
      const result = await runRedeploy(deployment => {
        deployment.prebuilt = true;
      });

      expect(result.exitCode, 'exit code for "redeploy"').toEqual(0);
      expect(result.stderr.split(prebuiltWarning)).toHaveLength(2);
      expect(result.stderr).toContain(
        `Deployment ${result.fromDeployment.id} is a prebuilt deployment.`
      );
      expect(result.stderr).toContain('create a new deployment instead');
      expect(result.stderr).toContain('vercel deploy --prebuilt');
      expect(result.stderr).toContain('(for example --environment production)');
      expect(result.stderr).toContain(
        'Learn More: https://vercel.com/docs/cli/deploy#prebuilt'
      );
      expect(result.stderr.indexOf(prebuiltWarning)).toBeLessThan(
        result.stderr.indexOf('Production      https')
      );
      expect(result.postRequests).toEqual([
        {
          query: { forceNew: '1' },
          body: {
            deploymentId: result.fromDeployment.id,
            meta: { action: 'redeploy' },
            name: result.fromDeployment.name,
            target: 'production',
          },
        },
      ]);
      expect(result.stdout).toEqual(`https://${result.toDeployment.url}`);
    });

    it('does not warn for a non-prebuilt deployment', async () => {
      const result = await runRedeploy();

      expect(result.exitCode, 'exit code for "redeploy"').toEqual(0);
      expect(result.stderr).not.toContain(prebuiltWarning);
      expect(result.postRequests).toHaveLength(1);
      expect(result.stdout).toEqual(`https://${result.toDeployment.url}`);
    });

    it('does not warn for a prebuilt deployment with manual provisioning', async () => {
      const result = await runRedeploy(deployment => {
        deployment.prebuilt = true;
        deployment.manualProvisioning = { state: 'COMPLETE' };
      });

      expect(result.exitCode, 'exit code for "redeploy"').toEqual(0);
      expect(result.stderr).not.toContain(prebuiltWarning);
      expect(result.postRequests).toHaveLength(1);
      expect(result.stdout).toEqual(`https://${result.toDeployment.url}`);
    });
  });

  describe('--environment', () => {
    it.each([
      ['--environment', 'production'],
      ['-e', 'production'],
    ])('should redeploy to the environment given with %s', async flag => {
      const { fromDeployment } = initRedeployTest({
        fromTarget: undefined,
        toTarget: 'production',
      });
      client.setArgv('redeploy', fromDeployment.id, flag, 'production');

      const exitCodePromise = redeploy(client);
      await expect(client.stderr).toOutput('Production      https');

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "redeploy"').toEqual(0);
      expect(client.stderr.getFullOutput()).not.toContain('deprecated');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'argument:urlOrDeploymentId', value: '[REDACTED]' },
        { key: 'option:environment', value: 'production' },
      ]);
    });

    it('should keep --target working with a deprecation warning', async () => {
      const { fromDeployment } = initRedeployTest({
        fromTarget: undefined,
        toTarget: 'production',
      });
      client.setArgv('redeploy', fromDeployment.id, '--target', 'production');

      const exitCodePromise = redeploy(client);
      await expect(client.stderr).toOutput(
        '--target is deprecated. Use --environment.'
      );
      await expect(client.stderr).toOutput('Production      https');
      expect(await exitCodePromise).toEqual(0);
    });

    it('should reject --target together with --environment', async () => {
      const { fromDeployment } = initRedeployTest({
        fromTarget: undefined,
        toTarget: 'production',
      });
      client.setArgv(
        'redeploy',
        fromDeployment.id,
        '--target',
        'production',
        '--environment',
        'preview'
      );

      expect(await redeploy(client)).toEqual(2);
      expect(client.stderr.getFullOutput()).toContain(
        "Can't use --target with --environment. Use --environment."
      );
    });
  });

  describe('--target', () => {
    it('should redeploy from preview to production', async () => {
      const { fromDeployment } = initRedeployTest({
        fromTarget: undefined,
        toTarget: 'production',
      });
      client.setArgv('redeploy', fromDeployment.id, '--target', 'production');

      const exitCodePromise = redeploy(client);
      await expect(client.stderr).toOutput(
        `Fetching deployment "${fromDeployment.id}" in ${fromDeployment.creator?.username}`
      );
      await expect(client.stderr).toOutput('Production      https');

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "redeploy"').toEqual(0);
    });

    it('should redeploy production to staging', async () => {
      const { fromDeployment } = initRedeployTest({
        fromTarget: 'production',
        toTarget: 'staging',
      });
      client.setArgv('redeploy', fromDeployment.id, '--target', 'staging');

      const exitCodePromise = redeploy(client);
      await expect(client.stderr).toOutput(
        `Fetching deployment "${fromDeployment.id}" in ${fromDeployment.creator?.username}`
      );
      await expect(client.stderr).toOutput('Preview         https');

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "redeploy"').toEqual(0);
    });

    it('should redeploy production to preview', async () => {
      const { fromDeployment } = initRedeployTest({
        fromTarget: 'production',
        toTarget: undefined,
      });
      client.setArgv('redeploy', fromDeployment.id, '--target', 'preview');

      const exitCodePromise = redeploy(client);
      await expect(client.stderr).toOutput(
        `Fetching deployment "${fromDeployment.id}" in ${fromDeployment.creator?.username}`
      );
      await expect(client.stderr).toOutput('Preview         https');

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "redeploy"').toEqual(0);
    });

    it('should redeploy to custom target', async () => {
      const { fromDeployment } = initRedeployTest({
        fromTarget: 'production',
        toTarget: undefined,
      });
      client.setArgv('redeploy', fromDeployment.id, '--target', 'custom');

      const exitCodePromise = redeploy(client);
      await expect(client.stderr).toOutput(
        `Fetching deployment "${fromDeployment.id}" in ${fromDeployment.creator?.username}`
      );
      await expect(client.stderr).toOutput('Preview         https');

      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "redeploy"').toEqual(0);
    });

    it('should error if target environment is not found', async () => {
      const invalidCustomEnvironment = 'custom-but-404';
      const { fromDeployment } = initRedeployTest({
        fromTarget: 'production',
        toTarget: undefined,
      });
      client.setArgv(
        'redeploy',
        fromDeployment.id,
        '--target',
        invalidCustomEnvironment
      );
      const exitCodePromise = redeploy(client);

      await expect(client.stderr).toOutput(
        `The provided argument "${invalidCustomEnvironment}" is not a valid target environment.`
      );
      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "redeploy"').toEqual(2);
    });
  });
});

function initRedeployTest({
  fromTarget,
  toTarget,
}: {
  fromTarget?: Deployment['target'];
  toTarget?: Deployment['target'] | undefined;
} = {}) {
  setupUnitFixture('commands/redeploy/simple-static');
  const user = useUser();
  useTeams('team_dummy');
  const { project } = useProject({
    ...defaultProject,
    id: 'vercel-redeploy',
    name: 'vercel-redeploy',
    customEnvironments: [
      {
        slug: 'custom',
        id: 'env_123123',
        type: 'preview',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  });

  const fromDeployment = useDeployment({ creator: user, target: fromTarget });
  const toDeployment = useDeployment({ creator: user, target: toTarget });

  const postRequests: { query: unknown; body: unknown }[] = [];
  client.scenario.post(`/v13/deployments`, (req, res) => {
    postRequests.push({ query: req.query, body: req.body });
    const { target, customEnvironmentSlugOrId } = req.body;
    if (target !== undefined && typeof target !== 'string') {
      res.status(400).json({
        message: 'Invalid request: `target` should be string',
      });
      return;
    }

    if (
      customEnvironmentSlugOrId !== undefined &&
      typeof customEnvironmentSlugOrId !== 'string'
    ) {
      res.status(400).json({
        message:
          'Invalid request: `customEnvironmentSlugOrId` should be string',
      });
      return;
    }

    if (
      customEnvironmentSlugOrId &&
      !project.customEnvironments?.some(
        ({ slug, id }) =>
          customEnvironmentSlugOrId === slug || customEnvironmentSlugOrId === id
      )
    ) {
      res.status(404).json({
        message: 'Invalid request: Custom Environment not found',
      });
      return;
    }

    res.json(toDeployment);
  });

  client.scenario.get(
    `/projects/:projectNameOrId/custom-environments`,
    (_req, res) => {
      res.json({ environments: project.customEnvironments });
      return;
    }
  );
  client.scenario.get(`/v9/projects/:projectNameOrId`, (_req, res) => {
    res.json(project);
    return;
  });

  return {
    project,
    fromDeployment,
    toDeployment,
    postRequests,
  };
}
