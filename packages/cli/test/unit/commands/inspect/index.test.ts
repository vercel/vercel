import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { useBuildLogs, useDeployment } from '../../../mocks/deployment';
import inspect from '../../../../src/commands/inspect';
import sleep from '../../../../src/util/sleep';

describe('inspect', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'inspect';

      client.setArgv(command, '--help');
      const exitCodePromise = inspect(client);
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  describe('[url]', () => {
    describe('--timeout', async () => {
      it('tracks --timeout', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user });
        client.setArgv('inspect', deployment.url, '--timeout', '0');
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'argument:deploymentIdOrHost',
            value: '[REDACTED]',
          },
          {
            key: 'option:timeout',
            value: '[REDACTED]',
          },
        ]);
      });
    });

    describe('--wait', async () => {
      it('tracks --wait', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user });
        client.setArgv('inspect', deployment.url, '--wait');
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'argument:deploymentIdOrHost',
            value: '[REDACTED]',
          },
          {
            key: 'flag:wait',
            value: 'TRUE',
          },
        ]);
      });
    });

    describe('--logs', async () => {
      it('tracks logs', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user });
        client.scenario.get(
          `/v3/now/deployments/${deployment.id}/events`,
          (req, res) => {
            res.json([]);
          }
        );

        client.setArgv('inspect', deployment.url, '--logs');
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'argument:deploymentIdOrHost',
            value: '[REDACTED]',
          },
          {
            key: 'flag:logs',
            value: 'TRUE',
          },
        ]);
      });
    });

    describe('--json', async () => {
      it('tracks --json flag', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user });
        client.setArgv('inspect', deployment.url, '--json');
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'argument:deploymentIdOrHost',
            value: '[REDACTED]',
          },
          {
            key: 'flag:json',
            value: 'TRUE',
          },
        ]);
      });

      it('outputs deployment information as JSON', async () => {
        const user = useUser();
        const deployment = useDeployment({
          creator: user,
          state: 'READY',
        });
        client.setArgv('inspect', deployment.url, '--json');
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);

        const output = client.stdout.getFullOutput();
        const jsonOutput = JSON.parse(output);

        expect(jsonOutput).toMatchObject({
          id: deployment.id,
          name: deployment.name,
          url: deployment.url,
          target: deployment.target,
          readyState: deployment.readyState,
          createdAt: deployment.createdAt,
          contextName: user.username,
        });
        expect(jsonOutput).not.toHaveProperty('readyStateReason');
      });

      it('includes readyStateReason in JSON output for a blocked deployment', async () => {
        const user = useUser();
        const deployment = useDeployment({
          creator: user,
          state: 'BLOCKED',
        });
        deployment.readyStateReason = 'Synthetic blocked reason';
        client.setArgv('inspect', deployment.url, '--json');
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);

        const jsonOutput = JSON.parse(client.stdout.getFullOutput());
        expect(jsonOutput).toMatchObject({
          id: deployment.id,
          readyState: 'BLOCKED',
          readyStateReason: 'Synthetic blocked reason',
        });
      });

      it('includes build machine resource config in JSON output when present', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user });
        deployment.resourceConfig = {
          buildMachine: {
            purchaseType: 'turbo',
            defaultPurchaseType: 'standard',
            machineSelectionType: 'fixed',
            selectionSource: 'deployment-override',
            cores: 30,
            memory: 61440,
          },
        };

        client.setArgv('inspect', deployment.url, '--json');
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);

        const jsonOutput = JSON.parse(client.stdout.getFullOutput());
        expect(Object.keys(jsonOutput.buildMachine)).toEqual([
          'cores',
          'memory',
          'machine',
          'selectionType',
          'selectionSource',
        ]);
        expect(jsonOutput.buildMachine).toEqual({
          cores: 30,
          memory: 61440,
          machine: 'turbo',
          selectionType: 'fixed',
          selectionSource: 'deployment-override',
        });
        expect(jsonOutput).not.toHaveProperty('resourceConfig');
      });

      it('excludes build machine resource config from JSON when missing', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user });

        client.setArgv('inspect', deployment.url, '--json');
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);

        const jsonOutput = JSON.parse(client.stdout.getFullOutput());
        expect(jsonOutput).not.toHaveProperty('buildMachine');
      });

      it('includes aliases in JSON output when present', async () => {
        const user = useUser();
        const deployment = useDeployment({
          creator: user,
        });
        // Manually set aliases since the mock doesn't accept it as a parameter
        deployment.alias = ['example.com', 'www.example.com'];

        client.setArgv('inspect', deployment.url, '--json');
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);

        const output = client.stdout.getFullOutput();
        const jsonOutput = JSON.parse(output);

        expect(jsonOutput).toHaveProperty('aliases');
        expect(jsonOutput.aliases).toEqual(['example.com', 'www.example.com']);
      });

      it('excludes aliases from JSON when not present', async () => {
        const user = useUser();
        const deployment = useDeployment({
          creator: user,
        });
        client.setArgv('inspect', deployment.url, '--json');
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);

        const output = client.stdout.getFullOutput();
        const jsonOutput = JSON.parse(output);

        // aliases should not be in the output if empty
        expect(jsonOutput).not.toHaveProperty('aliases');
      });

      it('works with --wait flag', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user, state: 'BUILDING' });
        client.setArgv('inspect', deployment.url, '--json', '--wait');

        let exitCode: number | null = null;

        const runInspect = async () => {
          exitCode = await inspect(client);
        };

        const slowlyDeploy = async () => {
          await sleep(100);
          expect(exitCode).toBeNull();
          deployment.readyState = 'READY';
        };

        await Promise.all<void>([runInspect(), slowlyDeploy()]);

        expect(exitCode).toEqual(0);

        const output = client.stdout.getFullOutput();
        const jsonOutput = JSON.parse(output);

        expect(jsonOutput).toMatchObject({
          id: deployment.id,
          readyState: 'READY',
        });
      });

      it('exits 1 when --wait times out while still building', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user, state: 'BUILDING' });
        client.setArgv(
          'inspect',
          deployment.url,
          '--json',
          '--wait',
          '--timeout',
          '1ms'
        );

        const exitCode = await inspect(client);
        expect(exitCode).toEqual(1);

        await expect(client.stderr).toOutput(
          'the deployment is still in progress'
        );
        const jsonOutput = JSON.parse(client.stdout.getFullOutput());
        expect(jsonOutput).toMatchObject({
          id: deployment.id,
          readyState: 'BUILDING',
        });
      });

      it('exits 1 when --wait sees the build fail', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user, state: 'BUILDING' });
        client.setArgv('inspect', deployment.url, '--json', '--wait');

        let exitCode: number | null = null;

        const runInspect = async () => {
          exitCode = await inspect(client);
        };

        const failBuild = async () => {
          await sleep(100);
          expect(exitCode).toBeNull();
          deployment.readyState = 'ERROR';
        };

        await Promise.all<void>([runInspect(), failBuild()]);

        expect(exitCode).toEqual(1);
      });
    });

    describe('build usage', () => {
      it('prints authoritative build usage and distinguishes requested machine from assigned cores', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user });
        Object.assign(deployment, {
          duration: {
            timeToReady: 40_000,
            timeToContainerExit: 45_000,
            timeForBilling: 60_000,
            cpuTimeForBilling: 12 * 60_000,
          },
          resourceConfig: {
            buildMachine: {
              purchaseType: 'enhanced',
              machineSelectionType: 'elastic',
              cores: 12,
            },
          },
        });

        client.setArgv('inspect', deployment.url);
        expect(await inspect(client)).toEqual(0);

        const output = client.getFullOutput();
        expect(output).toContain('build duration\t40s');
        expect(output).toContain('post-build duration\t5s');
        expect(output).toContain('billable duration\t1m');
        expect(output).toContain('CPU Minutes Usage\t12 minutes (1m x 12vCPU)');
        expect(output).toContain('requested build machine enhanced');
        expect(output).toContain(
          'actual assigned cores   12 vCPU (actual assignment)'
        );
      });

      it('includes seconds in build and post-build durations', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user });
        Object.assign(deployment, {
          duration: {
            timeToReady: 308_534,
            timeToContainerExit: 509_937,
          },
        });

        client.setArgv('inspect', deployment.url);
        expect(await inspect(client)).toEqual(0);

        const output = client.getFullOutput();
        expect(output).toContain('build duration\t5m 9s');
        expect(output).toContain('post-build duration\t3m 21s');
      });

      it('formats CPU minute usage from the server value', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user });
        Object.assign(deployment, {
          duration: { cpuTimeForBilling: 120_000 },
        });

        client.setArgv('inspect', deployment.url);
        expect(await inspect(client)).toEqual(0);
        expect(client.getFullOutput()).toContain(
          'CPU Minutes Usage\t2 minutes'
        );
      });

      it('renders unavailable values instead of inferring them for a running deployment', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user, state: 'BUILDING' });
        deployment.ready = deployment.buildingAt + 30_000;
        deployment.resourceConfig = {
          buildMachine: { purchaseType: 'standard' },
        };

        client.setArgv('inspect', deployment.url);
        expect(await inspect(client)).toEqual(0);

        const output = client.getFullOutput();
        expect(output).toContain('build duration\tunavailable');
        expect(output).toContain('post-build duration\tunavailable');
        expect(output).toContain('billable duration\tunavailable');
        expect(output).toContain('CPU Minutes Usage\tunavailable');
        expect(output).toContain('actual assigned cores   unavailable');
      });

      it('preserves the authoritative duration object in JSON', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user });
        Object.assign(deployment, {
          duration: {
            timeToReady: 40_000,
            timeToContainerExit: 45_000,
            timeForBilling: 60_000,
            cpuTimeForBilling: 720_000,
          },
          resourceConfig: {
            buildMachine: {
              purchaseType: 'enhanced',
              machineSelectionType: 'elastic',
              cores: 12,
            },
          },
        });

        client.setArgv('inspect', deployment.url, '--format=json');
        expect(await inspect(client)).toEqual(0);

        const jsonOutput = JSON.parse(client.stdout.getFullOutput());
        expect(jsonOutput.duration).toEqual({
          timeToReady: 40_000,
          timeToContainerExit: 45_000,
          timeForBilling: 60_000,
          cpuTimeForBilling: 720_000,
        });
        expect(jsonOutput.buildMachine).toMatchObject({
          machine: 'enhanced',
          selectionType: 'elastic',
          cores: 12,
        });
      });

      it('omits non-authoritative usage from JSON', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user });
        deployment.ready = deployment.buildingAt + 30_000;

        client.setArgv('inspect', deployment.url, '--format=json');
        expect(await inspect(client)).toEqual(0);

        expect(JSON.parse(client.stdout.getFullOutput())).not.toHaveProperty(
          'duration'
        );
      });

      it('preserves a partial duration response without inferring missing values', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user, state: 'BUILDING' });
        Object.assign(deployment, {
          duration: {
            startTime: 1_000,
            timeToReady: 40_000,
          },
        });

        client.setArgv('inspect', deployment.url, '--format=json');
        expect(await inspect(client)).toEqual(0);

        expect(JSON.parse(client.stdout.getFullOutput()).duration).toEqual({
          startTime: 1_000,
          timeToReady: 40_000,
        });
      });

      it('refreshes final usage while waiting for deployment completion', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user, state: 'BUILDING' });
        client.setArgv('inspect', deployment.url, '--format=json', '--wait');

        const runInspect = inspect(client);
        await sleep(100);
        Object.assign(deployment, {
          readyState: 'READY',
          duration: {
            timeToReady: 40_000,
            timeToContainerExit: 45_000,
            timeForBilling: 60_000,
            cpuTimeForBilling: 4 * 60_000,
          },
          resourceConfig: {
            buildMachine: { purchaseType: 'standard', cores: 4 },
          },
        });

        expect(await runInspect).toEqual(0);
        const jsonOutput = JSON.parse(client.stdout.getFullOutput());
        expect(jsonOutput.duration).toMatchObject({
          timeToReady: 40_000,
          timeToContainerExit: 45_000,
          cpuTimeForBilling: 240_000,
        });
        expect(jsonOutput.buildMachine.cores).toBe(4);
      });
    });

    describe('build cache', () => {
      const LIMIT_BYTES = 5_100_273_664; // 4.75 GiB, the turbo machine limit
      const savedWithCount = {
        version: 1,
        restore: { status: 'hit', source: 'branch' },
        save: {
          saved: true,
          compressedSizeBytes: 412 * 1024 * 1024,
          cacheLimitBytes: LIMIT_BYTES,
          fileCount: 18_342,
        },
      };
      const savedWithoutCount = {
        version: 1,
        restore: { status: 'miss' },
        save: {
          saved: true,
          compressedSizeBytes: 2048,
          cacheLimitBytes: LIMIT_BYTES,
        },
      };
      const notSaved = {
        version: 1,
        restore: { status: 'skipped', reason: 'prebuilt' },
        save: { saved: false, reason: 'prebuilt' },
      };
      const uploadFailed = {
        version: 1,
        restore: { status: 'failed' },
        save: { saved: false, reason: 'failed' },
      };
      const sizeExceeded = {
        version: 1,
        restore: { status: 'hit', source: 'production' },
        save: {
          saved: false,
          reason: 'size_exceeded',
          cacheLimitBytes: LIMIT_BYTES,
        },
      };

      async function inspectBuildCache(
        buildCacheSummary: unknown,
        ...flags: string[]
      ) {
        const user = useUser();
        const deployment = useDeployment({ creator: user });
        if (buildCacheSummary !== undefined) {
          Object.assign(deployment, { buildCacheSummary });
        }
        client.setArgv('inspect', deployment.url, ...flags);
        expect(await inspect(client)).toEqual(0);
      }

      function buildCacheSection() {
        const output = client.getFullOutput();
        const start = output.indexOf('Build Cache');
        expect(start).toBeGreaterThan(-1);
        return output.slice(start, output.indexOf('Duration', start)).trim();
      }

      it('prints a saved cache with its approximate file count', async () => {
        await inspectBuildCache(savedWithCount);
        expect(buildCacheSection()).toMatchInlineSnapshot(`
          "Build Cache

              size       412 MiB / 4.75 GiB limit
              file count ~18,342 (approx., paths selected for packing)"
        `);
      });

      it('omits the file count when the API does not report it', async () => {
        await inspectBuildCache(savedWithoutCount);
        expect(buildCacheSection()).toMatchInlineSnapshot(`
          "Build Cache

              size 2 KiB / 4.75 GiB limit"
        `);
      });

      it('prints why the cache was not saved, with no size', async () => {
        await inspectBuildCache(notSaved);
        expect(buildCacheSection()).toMatchInlineSnapshot(`
          "Build Cache

              not saved (prebuilt deployment)"
        `);
      });

      it('prints an upload failure with no size', async () => {
        await inspectBuildCache(uploadFailed);
        expect(buildCacheSection()).toMatchInlineSnapshot(`
          "Build Cache

              upload failed"
        `);
      });

      it('prints the exceeded limit when the cache was too large to save', async () => {
        await inspectBuildCache(sizeExceeded);
        expect(buildCacheSection()).toMatchInlineSnapshot(`
          "Build Cache

              not saved (exceeded 4.75 GiB limit)"
        `);
      });

      it('prints reported zero sizes and counts', async () => {
        await inspectBuildCache({
          version: 1,
          save: {
            saved: true,
            compressedSizeBytes: 0,
            cacheLimitBytes: 0,
            fileCount: 0,
          },
        });
        expect(buildCacheSection()).toMatchInlineSnapshot(`
          "Build Cache

              size       0 B / 0 B limit
              file count ~0 (approx., paths selected for packing)"
        `);
      });

      it('does not print restore information', async () => {
        await inspectBuildCache(sizeExceeded);
        const section = buildCacheSection();
        expect(section).not.toContain('restore');
        expect(section).not.toContain('production');
        expect(section).not.toContain('outcome');
      });

      it.each([
        ['missing', undefined],
        ['null', null],
        ['an unknown version', { ...savedWithCount, version: 2 }],
        ['a restore-only', { version: 1, restore: { status: 'hit' } }],
        ['a saved without sizes', { version: 1, save: { saved: true } }],
        [
          'a non-numeric size',
          {
            version: 1,
            save: { saved: true, compressedSizeBytes: '1', cacheLimitBytes: 2 },
          },
        ],
        [
          'an oversized without a limit',
          { version: 1, save: { saved: false, reason: 'size_exceeded' } },
        ],
        [
          'a not-saved without a reason',
          { version: 1, save: { saved: false } },
        ],
      ])('prints %s summary as unavailable', async (_name, summary) => {
        await inspectBuildCache(summary);
        const section = buildCacheSection();
        expect(section).toBe('Build Cache\n\n    unavailable');
      });

      it.each([
        ['saved with count', savedWithCount],
        ['saved without count', savedWithoutCount],
        ['not saved', notSaved],
        ['upload failed', uploadFailed],
        ['size exceeded', sizeExceeded],
      ])('passes only the %s save outcome to JSON', async (_name, summary) => {
        await inspectBuildCache(summary, '--format=json');
        expect(
          JSON.parse(client.stdout.getFullOutput()).buildCacheSummary
        ).toStrictEqual({ save: summary.save });
      });

      it('leaves restore and version out of JSON', async () => {
        await inspectBuildCache(savedWithCount, '--format=json');
        expect(
          JSON.parse(client.stdout.getFullOutput()).buildCacheSummary
        ).toMatchInlineSnapshot(`
          {
            "save": {
              "cacheLimitBytes": 5100273664,
              "compressedSizeBytes": 432013312,
              "fileCount": 18342,
              "saved": true,
            },
          }
        `);
      });

      it('omits a restore-only summary from JSON', async () => {
        await inspectBuildCache(
          { version: 1, restore: { status: 'miss' } },
          '--format=json'
        );
        expect(JSON.parse(client.stdout.getFullOutput())).not.toHaveProperty(
          'buildCacheSummary'
        );
      });

      it('omits a missing summary from JSON', async () => {
        await inspectBuildCache(undefined, '--format=json');
        expect(JSON.parse(client.stdout.getFullOutput())).not.toHaveProperty(
          'buildCacheSummary'
        );
      });

      it('omits a null summary from JSON', async () => {
        await inspectBuildCache(null, '--format=json');
        expect(JSON.parse(client.stdout.getFullOutput())).not.toHaveProperty(
          'buildCacheSummary'
        );
      });
    });

    describe('--format', async () => {
      it('tracks telemetry for --format json', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user });
        client.setArgv('inspect', deployment.url, '--format', 'json');
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'argument:deploymentIdOrHost',
            value: '[REDACTED]',
          },
          {
            key: 'option:format',
            value: 'json',
          },
        ]);
      });

      it('outputs deployment as valid JSON that can be piped to jq', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user });
        client.setArgv('inspect', deployment.url, '--format', 'json');
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);

        const output = client.stdout.getFullOutput();
        // Should be valid JSON - this will throw if not parseable
        const jsonOutput = JSON.parse(output);

        expect(jsonOutput).toHaveProperty('id');
        expect(jsonOutput).toHaveProperty('url');
        expect(jsonOutput).toHaveProperty('readyState');
      });

      it('outputs build logs as a top-level JSON array without printing logs to stderr', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user });
        useBuildLogs({
          deployment,
          logProducer: async function* () {
            yield {
              created: 1717426870339,
              date: 1717426870339,
              deploymentId: deployment.id,
              id: 'evt_1',
              info: { type: 'build', name: 'install', step: 'install' },
              serial: '1',
              text: '\u001b[31mHello, world!\u001b[39m',
              type: 'stdout',
            };
            yield {
              created: 1717426870340,
              date: 1717426870340,
              deploymentId: deployment.id,
              id: 'evt_2',
              info: { type: 'build', name: 'build', step: 'build' },
              level: 'warning',
              serial: '2',
              text: 'Line 1\nLine 2\n',
              type: 'stderr',
            };
          },
        });

        client.setArgv('inspect', deployment.url, '--logs', '--format', 'json');
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);

        const stdout = client.stdout.getFullOutput();
        const logsOutput = JSON.parse(stdout);

        expect(Array.isArray(logsOutput)).toBe(true);
        expect(logsOutput).toHaveLength(2);
        expect(logsOutput).not.toHaveProperty('id');
        expect(logsOutput[0]).toMatchObject({
          created: 1717426870339,
          date: 1717426870339,
          type: 'stdout',
          text: '\u001b[31mHello, world!\u001b[39m',
          id: 'evt_1',
          serial: '1',
          deploymentId: deployment.id,
          info: { type: 'build', name: 'install', step: 'install' },
        });
        expect(logsOutput[0]).not.toHaveProperty('level');
        expect(logsOutput[0]).not.toHaveProperty('step');
        expect(logsOutput[0].text).toContain('\u001b');
        expect(logsOutput[1]).toMatchObject({
          created: 1717426870340,
          date: 1717426870340,
          level: 'warning',
          type: 'stderr',
          text: 'Line 1\nLine 2\n',
          id: 'evt_2',
          serial: '2',
          deploymentId: deployment.id,
          info: { type: 'build', name: 'build', step: 'build' },
        });
        expect(logsOutput[1]).not.toHaveProperty('step');

        const stderr = client.stderr.getFullOutput();
        expect(stderr).not.toContain('Hello, world!');
        expect(stderr).not.toContain('Line 1');
        expect(stderr).not.toContain('Line 2');
      });
    });

    it('tracks deplomymentUrl as telemetry', async () => {
      const user = useUser();
      const deployment = useDeployment({ creator: user });
      client.setArgv('inspect', deployment.url);
      const exitCode = await inspect(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:deploymentIdOrHost',
          value: '[REDACTED]',
        },
      ]);
    });

    it('prints error when not providing deployement id or url', async () => {
      client.setArgv('inspect');
      const exitCode = await inspect(client);
      const output = client.getFullOutput();
      expect(exitCode).toEqual(2);
      expect(output).toContain(
        '`vercel inspect <deployment>` expects exactly one argument'
      );
      expect(output).not.toContain('<url>');
    });

    it('should print out deployment information', async () => {
      const user = useUser();
      const deployment = useDeployment({ creator: user });
      client.setArgv('inspect', deployment.url);
      const exitCode = await inspect(client);
      await expect(client.stderr).toOutput(
        `> Fetched deployment "${deployment.url}" in ${user.username}`
      );
      expect(exitCode).toEqual(0);
    });

    it('should print status and reason for a blocked deployment', async () => {
      const user = useUser();
      const deployment = useDeployment({ creator: user, state: 'BLOCKED' });
      deployment.readyStateReason = 'Synthetic blocked reason';
      client.setArgv('inspect', deployment.url);
      const exitCode = await inspect(client);
      expect(exitCode).toEqual(0);

      const output = client.getFullOutput();
      expect(output).toContain('status\t● Blocked');
      expect(output).toContain('reason\tSynthetic blocked reason');
      expect(output).not.toContain('UNKNOWN');
    });

    it('should omit reason when the deployment has none', async () => {
      const user = useUser();
      const deployment = useDeployment({ creator: user });
      client.setArgv('inspect', deployment.url);
      const exitCode = await inspect(client);
      expect(exitCode).toEqual(0);
      expect(client.getFullOutput()).not.toContain('reason\t');
    });

    it('should print target information', async () => {
      const user = useUser();
      const deployment = useDeployment({ creator: user });
      client.setArgv('inspect', deployment.url);
      const exitCode = await inspect(client);
      await expect(client.stderr).toOutput(`target\tproduction`);
      expect(exitCode).toEqual(0);
    });

    it('should print build machine resource config when present', async () => {
      const user = useUser();
      const deployment = useDeployment({ creator: user });
      deployment.resourceConfig = {
        buildMachine: {
          purchaseType: 'turbo',
          defaultPurchaseType: 'standard',
          machineSelectionType: 'fixed',
          selectionSource: 'deployment-override',
          cores: 30,
          memory: 61440,
        },
      };

      client.setArgv('inspect', deployment.url);
      const exitCode = await inspect(client);
      expect(exitCode).toEqual(0);

      const output = client.getFullOutput();
      expect(output).toContain('Build Machine');
      expect(output).toMatch(
        /requested build machine turbo[\s\S]*actual assigned cores {3}30 vCPU \(actual assignment\)[\s\S]*memory {18}61440 MiB[\s\S]*selection type {10}fixed[\s\S]*selection source {8}deployment-override/
      );
      expect(output).not.toContain('default purchase type');
    });

    it('should omit build machine resource config when missing', async () => {
      const user = useUser();
      const deployment = useDeployment({ creator: user });

      client.setArgv('inspect', deployment.url);
      const exitCode = await inspect(client);
      expect(exitCode).toEqual(0);
      expect(client.getFullOutput()).not.toContain('Build Machine');
    });

    it('should print out deployment information for piped URL', async () => {
      const user = useUser();
      const deployment = useDeployment({ creator: user });
      client.stdin.isTTY = false;
      client.stdin.write(deployment.url);
      client.stdin.end();
      const exitCode = await inspect(client);
      await expect(client.stderr).toOutput(
        `> Fetched deployment "${deployment.url}" in ${user.username}`
      );
      expect(exitCode).toEqual(0);
    });

    it('should print error when piped input is empty', async () => {
      client.stdin.isTTY = false;
      client.stdin.write('\n');
      client.stdin.end();
      const exitCode = await inspect(client);
      expect(exitCode).toEqual(2);
      await expect(client.stderr).toOutput(
        '`vercel inspect <deployment>` expects exactly one argument'
      );
    });

    it('should strip the scheme of a url', async () => {
      const user = useUser();
      const deployment = useDeployment({ creator: user });
      client.setArgv('inspect', `http://${deployment.url}`);
      const exitCode = await inspect(client);
      expect(exitCode).toEqual(0);
      await expect(client.stderr).toOutput(
        `> Fetched deployment "${deployment.url}" in ${user.username}`
      );
    });

    it('should print error when deployment not found', async () => {
      const user = useUser();
      useDeployment({ creator: user });
      client.setArgv('inspect', 'bad.com');
      await expect(inspect(client)).rejects.toThrow(
        `Can't find the deployment "bad.com" under the context "${user.username}"`
      );
    });

    it('should print error if timeout is invalid', async () => {
      const user = useUser();
      useDeployment({ creator: user });
      client.setArgv('inspect', 'foo.com', '--timeout', 'bar');
      const exitCode = await inspect(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(`Invalid timeout "bar"`);
    });

    it('should print no build logs for a queued deployment', async () => {
      const user = useUser();
      const deployment = useDeployment({ creator: user, state: 'QUEUED' });
      useBuildLogs({
        deployment,
        logProducer: async function* () {},
      });

      client.setArgv('inspect', deployment.url, '--logs');
      const exitCode = await inspect(client);
      await expect(client.stderr).toOutput(
        `Fetching deployment "${deployment.url}" in ${user.username}`
      );
      expect(
        client.getFullOutput().split('\n').slice(1).join('\n')
      ).toMatchInlineSnapshot(`
        "status	● Queued
        "
      `);
      expect(exitCode).toEqual(0);
    });

    it('should print BLOCKED status with --logs', async () => {
      const user = useUser();
      const deployment = useDeployment({ creator: user, state: 'BLOCKED' });
      useBuildLogs({
        deployment,
        logProducer: async function* () {},
      });

      client.setArgv('inspect', deployment.url, '--logs');
      const exitCode = await inspect(client);
      await expect(client.stderr).toOutput(
        `Fetching deployment "${deployment.url}" in ${user.username}`
      );
      expect(
        client.getFullOutput().split('\n').slice(1).join('\n')
      ).toMatchInlineSnapshot(`
        "status	● Blocked
        "
      `);
      expect(exitCode).toEqual(0);
    });

    it('should print build logs of a failed deployment', async () => {
      const user = useUser();
      const deployment = useDeployment({ creator: user, state: 'ERROR' });
      useBuildLogs({
        deployment,
        logProducer: async function* () {
          yield { created: 1717426870339, text: 'Hello, world!' };
          yield { created: 1717426870340, text: 'Bye...' };
        },
      });

      client.setArgv('inspect', deployment.url, '--logs');
      const exitCode = await inspect(client);
      await expect(client.stderr).toOutput(
        `Fetching deployment "${deployment.url}" in ${user.username}`
      );
      expect(
        client.getFullOutput().split('\n').slice(1).join('\n')
      ).toMatchInlineSnapshot(`
        "2024-06-03T15:01:10.339Z  Hello, world!
        2024-06-03T15:01:10.340Z  Bye...
        status	● Error
        "
      `);
      expect(exitCode).toEqual(1);
    });

    it('should print build logs while waiting for a finished deployment', async () => {
      let exitCode: number | null = null;
      const user = useUser();
      const deployment = useDeployment({ creator: user, state: 'BUILDING' });
      useBuildLogs({
        deployment,
        logProducer: async function* () {
          yield { created: 1717426870339, text: 'Hello, world!' };
          await sleep(100);
          yield { created: 1717426870340, text: 'building...' };
          await sleep(100);
          yield { created: 1717426871000, text: 'build complete' };
          await sleep(100);
          yield { created: 1717426871235, text: 'Bye...' };
        },
      });

      const runInspect = async () => {
        client.setArgv('inspect', deployment.url, '--logs', '--wait');
        exitCode = await inspect(client);
        await expect(client.stderr).toOutput(
          `Fetching deployment "${deployment.url}" in ${user.username}`
        );
      };

      const slowlyDeploy = async () => {
        await sleep(1234);
        expect(exitCode).toBeNull();
        deployment.readyState = 'READY';
      };

      await Promise.all<void>([runInspect(), slowlyDeploy()]);

      expect(exitCode).toEqual(0);
      expect(
        client.getFullOutput().split('\n').slice(1).join('\n')
      ).toMatchInlineSnapshot(`
        "2024-06-03T15:01:10.339Z  Hello, world!
        2024-06-03T15:01:10.340Z  building...
        2024-06-03T15:01:11.000Z  build complete
        2024-06-03T15:01:11.235Z  Bye...
        status	● Ready
        "
      `);
    });

    describe('dashboard URL parsing', () => {
      it('sets team scope from dashboard URL', async () => {
        const user = useUser();
        const team = useTeam();
        team.slug = 'dashboard-team';
        const deployment = useDeployment({ creator: user });

        client.setArgv(
          'inspect',
          `https://vercel.com/${team.slug}/my-project/${deployment.id}`
        );
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);
        expect(client.config.currentTeam).toEqual(team.id);
      });

      it('does not override explicit --scope flag', async () => {
        const user = useUser();
        const team = useTeam();
        team.slug = 'dashboard-team';
        const deployment = useDeployment({ creator: user });

        client.config.currentTeam = team.id;
        client.setArgv(
          'inspect',
          `https://vercel.com/other-team/my-project/${deployment.id}`,
          '--scope',
          team.slug
        );
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);
        expect(client.config.currentTeam).toEqual(team.id);
      });

      it('resolves bare deployment ID with dpl_ prefix', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user });
        const bareId = deployment.id.replace('dpl_', '');

        client.setArgv('inspect', bareId);
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);
        await expect(client.stderr).toOutput(
          `Fetched deployment "${deployment.url}"`
        );
      });
    });

    describe('builds request', () => {
      // Records when each request arrives and holds the deployment response
      // until the builds request arrives (or 500ms pass), so requests sent one
      // after the other show up in order.
      function trackRequests() {
        const events: string[] = [];
        let onBuildsRequest = () => {};
        const buildsRequested = new Promise<void>(resolve => {
          onBuildsRequest = resolve;
        });
        client.scenario.get(
          '/v13/deployments/:id',
          async (_req, _res, next) => {
            events.push('deployment requested');
            await Promise.race([buildsRequested, sleep(500)]);
            events.push('deployment returned');
            next?.();
          }
        );
        client.scenario.get(
          '/v11/deployments/:id/builds',
          (_req, _res, next) => {
            events.push('builds requested');
            onBuildsRequest();
            next?.();
          }
        );
        return events;
      }

      it('is sent alongside the deployment request for a deployment ID', async () => {
        const events = trackRequests();
        const user = useUser();
        const deployment = useDeployment({ creator: user });
        client.setArgv('inspect', deployment.id);
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);
        const buildsRequested = events.indexOf('builds requested');
        expect(buildsRequested).toBeGreaterThanOrEqual(0);
        expect(buildsRequested).toBeLessThan(
          events.indexOf('deployment returned')
        );
        await expect(client.stderr).toOutput(
          `Fetched deployment "${deployment.url}"`
        );
      });

      it('is sent alongside the deployment request for a deployment ID with --json', async () => {
        const events = trackRequests();
        const user = useUser();
        const deployment = useDeployment({ creator: user });
        client.setArgv('inspect', deployment.id, '--json');
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);
        const buildsRequested = events.indexOf('builds requested');
        expect(buildsRequested).toBeGreaterThanOrEqual(0);
        expect(buildsRequested).toBeLessThan(
          events.indexOf('deployment returned')
        );
        const jsonOutput = JSON.parse(client.stdout.getFullOutput());
        expect(jsonOutput.id).toEqual(deployment.id);
      });

      it('is sent once, alongside the deployment request, for a piped deployment ID', async () => {
        const events = trackRequests();
        const user = useUser();
        const deployment = useDeployment({ creator: user });
        client.stdin.isTTY = false;
        client.stdin.write(`${deployment.id}\n`);
        client.stdin.end();
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);
        const buildsRequested = events.indexOf('builds requested');
        expect(buildsRequested).toBeGreaterThanOrEqual(0);
        expect(buildsRequested).toBeLessThan(
          events.indexOf('deployment returned')
        );
        expect(
          events.filter(event => event === 'builds requested')
        ).toHaveLength(1);
        await expect(client.stderr).toOutput(
          `Fetched deployment "${deployment.url}"`
        );
      });

      it('is sent after the deployment request for a URL', async () => {
        const events = trackRequests();
        const user = useUser();
        const deployment = useDeployment({ creator: user });
        client.setArgv('inspect', deployment.url);
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);
        expect(events).toEqual([
          'deployment requested',
          'deployment returned',
          'builds requested',
        ]);
      });

      it('is sent after the deployment finishes with --wait', async () => {
        const events = trackRequests();
        const user = useUser();
        const deployment = useDeployment({ creator: user, state: 'BUILDING' });
        client.setArgv('inspect', deployment.id, '--wait', '--json');
        const runInspect = inspect(client);
        // The first deployment response is held for 500ms while the builds
        // request is checked for.
        await sleep(600);
        deployment.readyState = 'READY';
        expect(await runInspect).toEqual(0);
        expect(events.indexOf('builds requested')).toEqual(events.length - 1);
        expect(
          events.filter(event => event === 'deployment requested').length
        ).toBeGreaterThan(1);
      });

      it('is not sent with --logs', async () => {
        const events = trackRequests();
        const user = useUser();
        const deployment = useDeployment({ creator: user });
        useBuildLogs({
          deployment,
          logProducer: async function* () {},
        });
        client.setArgv('inspect', deployment.id, '--logs');
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);
        expect(events).not.toContain('builds requested');
      });

      it('reports a deployment ID that does not exist as not found', async () => {
        const user = useUser();
        useDeployment({ creator: user });
        client.setArgv('inspect', 'dpl_doesNotExist');
        await expect(inspect(client)).rejects.toThrow(
          `Can't find the deployment "dpl_doesNotExist" under the context "${user.username}"`
        );
      });
    });
  });
});
