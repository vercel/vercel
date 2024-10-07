import os from 'node:os';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import './test/mocks/matchers';

import { Output } from '../../src/util/output';
import { TelemetryEventStore } from '../../src/util/telemetry';
import { RootTelemetryClient } from '../../src/util/telemetry/root';

import './test/mocks/matchers';

describe('main', () => {
  describe('telemetry', () => {
    it('tracks number of cpus', () => {
      vi.spyOn(os, 'cpus').mockImplementation(() => [
        {
          model: 'mock',
          speed: 0,
          times: {
            user: 0,
            nice: 0,
            sys: 0,
            idle: 0,
            irq: 0,
          },
        },
      ]);
      const output = new Output(process.stderr, {
        debug: true,
        noColor: false,
      });

      const telemetryEventStore = new TelemetryEventStore({
        isDebug: true,
        output,
      });

      const telemetry = new RootTelemetryClient({
        opts: {
          store: telemetryEventStore,
          output,
        },
      });
      telemetry.trackCPUs();
      expect(telemetryEventStore).toHaveTelemetryEvents([
        { key: 'cpu_count', value: '1' },
      ]);
    });

    it('tracks platform', () => {
      vi.spyOn(os, 'platform').mockImplementation(() => 'linux');
      const output = new Output(process.stderr, {
        debug: true,
        noColor: false,
      });

      const telemetryEventStore = new TelemetryEventStore({
        isDebug: true,
        output,
      });

      const telemetry = new RootTelemetryClient({
        opts: {
          store: telemetryEventStore,
          output,
        },
      });
      telemetry.trackPlatform();
      expect(telemetryEventStore).toHaveTelemetryEvents([
        { key: 'platform', value: 'linux' },
      ]);
    });

    it('tracks arch', () => {
      vi.spyOn(os, 'arch').mockImplementation(() => 'x86');
      const output = new Output(process.stderr, {
        debug: true,
        noColor: false,
      });

      const telemetryEventStore = new TelemetryEventStore({
        isDebug: true,
        output,
      });

      const telemetry = new RootTelemetryClient({
        opts: {
          store: telemetryEventStore,
          output,
        },
      });
      telemetry.trackArch();
      expect(telemetryEventStore).toHaveTelemetryEvents([
        { key: 'arch', value: 'x86' },
      ]);
    });

    describe('version', () => {
      it('tracks nothing when version is empty', () => {
        const output = new Output(process.stderr, {
          debug: true,
          noColor: false,
        });

        const telemetryEventStore = new TelemetryEventStore({
          isDebug: true,
          output,
        });

        const telemetry = new RootTelemetryClient({
          opts: {
            store: telemetryEventStore,
            output,
          },
        });

        telemetry.trackVersion(undefined);
        expect(telemetryEventStore).toHaveTelemetryEvents([]);
      });

      it('tracks version', () => {
        const output = new Output(process.stderr, {
          debug: true,
          noColor: false,
        });

        const telemetryEventStore = new TelemetryEventStore({
          isDebug: true,
          output,
        });

        const telemetry = new RootTelemetryClient({
          opts: {
            store: telemetryEventStore,
            output,
          },
        });

        telemetry.trackVersion('1.0.0');
        expect(telemetryEventStore).toHaveTelemetryEvents([
          { key: 'version', value: '1.0.0' },
        ]);
      });
    });

    describe('tracking enabled', () => {
      it('is false when VERCEL_TELEMETRY_DISABLED set', () => {
        const configThatWillBeIgnoredAnyway = {
          enabled: true,
        };

        vi.stubEnv('VERCEL_TELEMETRY_DISABLED', '1');
        const output = new Output(process.stderr, {
          debug: true,
          noColor: false,
        });

        const telemetryEventStore = new TelemetryEventStore({
          isDebug: true,
          output,
          config: configThatWillBeIgnoredAnyway,
        });

        expect(telemetryEventStore.enabled).toBe(false);
      });
    });

    describe('CI Vendor Name', () => {
      let telemetry: RootTelemetryClient;
      let telemetryEventStore: TelemetryEventStore;
      beforeEach(() => {
        // stubbing so that when we run this in Github Actions these tests can work
        vi.stubEnv('GITHUB_ACTIONS', '');
        const output = new Output(process.stderr, {
          debug: true,
          noColor: false,
        });

        telemetryEventStore = new TelemetryEventStore({
          isDebug: true,
          output,
          config: {
            enabled: true,
          },
        });

        telemetry = new RootTelemetryClient({
          opts: {
            store: telemetryEventStore,
            output,
          },
        });
      });

      afterEach(() => {
        vi.unstubAllEnvs();
      });

      it('tracks nothing when not in a CI', () => {
        telemetry.trackCIVendorName();
        expect(telemetryEventStore.readonlyEvents).toMatchObject([]);
      });

      describe('Appcircle', () => {
        it('tracks when AC_APPCIRCLE is present', () => {
          vi.stubEnv('AC_APPCIRCLE', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Appcircle',
            }),
          ]);
        });
      });
      describe('AppVeyor', () => {
        it('tracks when APPVEYOR is present', () => {
          vi.stubEnv('APPVEYOR', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'AppVeyor',
            }),
          ]);
        });
      });
      describe('AWS CodeBuild', () => {
        it('tracks when CODEBUILD_BUILD_ARN is present', () => {
          vi.stubEnv('CODEBUILD_BUILD_ARN', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'AWS CodeBuild',
            }),
          ]);
        });
      });
      describe('Azure Pipelines', () => {
        it('tracks when SYSTEM_TEAMFOUNDATIONCOLLECTIONURI is present', () => {
          vi.stubEnv('SYSTEM_TEAMFOUNDATIONCOLLECTIONURI', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Azure Pipelines',
            }),
          ]);
        });
      });
      describe('Bamboo', () => {
        it('tracks when bamboo_planKey is present', () => {
          vi.stubEnv('bamboo_planKey', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Bamboo',
            }),
          ]);
        });
      });
      describe('Bitbucket Pipelines', () => {
        it('tracks when BITBUCKET_COMMIT is present', () => {
          vi.stubEnv('BITBUCKET_COMMIT', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Bitbucket Pipelines',
            }),
          ]);
        });
      });
      describe('Bitrise', () => {
        it('tracks when BITRISE_IO is present', () => {
          vi.stubEnv('BITRISE_IO', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Bitrise',
            }),
          ]);
        });
      });
      describe('Buddy', () => {
        it('tracks when BUDDY_WORKSPACE_ID is present', () => {
          vi.stubEnv('BUDDY_WORKSPACE_ID', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Buddy',
            }),
          ]);
        });
      });
      describe('Buildkite', () => {
        it('tracks when BUILDKITE is present', () => {
          vi.stubEnv('BUILDKITE', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Buildkite',
            }),
          ]);
        });
      });
      describe('CircleCI', () => {
        it('tracks when CIRCLECI is present', () => {
          vi.stubEnv('CIRCLECI', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'CircleCI',
            }),
          ]);
        });
      });
      describe('Cirrus CI', () => {
        it('tracks when CIRRUS_CI is present', () => {
          vi.stubEnv('CIRRUS_CI', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Cirrus CI',
            }),
          ]);
        });
      });
      describe('Codefresh', () => {
        it('tracks when CF_BUILD_ID is present', () => {
          vi.stubEnv('CF_BUILD_ID', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Codefresh',
            }),
          ]);
        });
      });
      describe('Codemagic', () => {
        it('tracks when CM_BUILD_ID is present', () => {
          vi.stubEnv('CM_BUILD_ID', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Codemagic',
            }),
          ]);
        });
      });
      describe('Codeship', () => {
        it('tracks when the value matches', () => {
          vi.stubEnv('CI_NAME', 'codeship');
          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Codeship',
            }),
          ]);
        });
        it("doesn't track when the value doesn't match", () => {
          vi.stubEnv('CI_NAME', 'not_the_value');
          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([]);
        });
      });
      describe('Drone', () => {
        it('tracks when DRONE is present', () => {
          vi.stubEnv('DRONE', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Drone',
            }),
          ]);
        });
      });
      describe('dsari', () => {
        it('tracks when DSARI is present', () => {
          vi.stubEnv('DSARI', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'dsari',
            }),
          ]);
        });
      });
      describe('Expo Application Services', () => {
        it('tracks when EAS_BUILD is present', () => {
          vi.stubEnv('EAS_BUILD', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Expo Application Services',
            }),
          ]);
        });
      });
      describe('GitHub Actions', () => {
        it('tracks when GITHUB_ACTIONS is present', () => {
          vi.stubEnv('GITHUB_ACTIONS', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'GitHub Actions',
            }),
          ]);
        });
      });
      describe('GitLab CI', () => {
        it('tracks when GITLAB_CI is present', () => {
          vi.stubEnv('GITLAB_CI', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'GitLab CI',
            }),
          ]);
        });
      });
      describe('GoCD', () => {
        it('tracks when GO_PIPELINE_LABEL is present', () => {
          vi.stubEnv('GO_PIPELINE_LABEL', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'GoCD',
            }),
          ]);
        });
      });
      describe('Google Cloud Build', () => {
        it('tracks when BUILDER_OUTPUT is present', () => {
          vi.stubEnv('BUILDER_OUTPUT', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Google Cloud Build',
            }),
          ]);
        });
      });
      describe('LayerCI', () => {
        it('tracks when LAYERCI is present', () => {
          vi.stubEnv('LAYERCI', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'LayerCI',
            }),
          ]);
        });
      });
      describe('Gerrit', () => {
        it('tracks when GERRIT_PROJECT is present', () => {
          vi.stubEnv('GERRIT_PROJECT', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Gerrit',
            }),
          ]);
        });
      });
      describe('Hudson', () => {
        it('tracks when HUDSON is present', () => {
          vi.stubEnv('HUDSON', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Hudson',
            }),
          ]);
        });
      });

      describe('Magnum CI', () => {
        it('tracks when MAGNUM is present', () => {
          vi.stubEnv('MAGNUM', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Magnum CI',
            }),
          ]);
        });
      });
      describe('Netlify CI', () => {
        it('tracks when NETLIFY is present', () => {
          vi.stubEnv('NETLIFY', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Netlify CI',
            }),
          ]);
        });
      });
      describe('Nevercode', () => {
        it('tracks when NEVERCODE is present', () => {
          vi.stubEnv('NEVERCODE', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Nevercode',
            }),
          ]);
        });
      });
      describe('ReleaseHub', () => {
        it('tracks when RELEASE_BUILD_ID is present', () => {
          vi.stubEnv('RELEASE_BUILD_ID', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'ReleaseHub',
            }),
          ]);
        });
      });
      describe('Render', () => {
        it('tracks when RENDER is present', () => {
          vi.stubEnv('RENDER', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Render',
            }),
          ]);
        });
      });
      describe('Sail CI', () => {
        it('tracks when SAILCI is present', () => {
          vi.stubEnv('SAILCI', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Sail CI',
            }),
          ]);
        });
      });
      describe('Screwdriver', () => {
        it('tracks when SCREWDRIVER is present', () => {
          vi.stubEnv('SCREWDRIVER', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Screwdriver',
            }),
          ]);
        });
      });
      describe('Semaphore', () => {
        it('tracks when SEMAPHORE is present', () => {
          vi.stubEnv('SEMAPHORE', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Semaphore',
            }),
          ]);
        });
      });
      describe('Shippable', () => {
        it('tracks when SHIPPABLE is present', () => {
          vi.stubEnv('SHIPPABLE', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Shippable',
            }),
          ]);
        });
      });
      describe('Solano CI', () => {
        it('tracks when TDDIUM is present', () => {
          vi.stubEnv('TDDIUM', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Solano CI',
            }),
          ]);
        });
      });
      describe('Sourcehut', () => {
        it('tracks when the value matches', () => {
          vi.stubEnv('CI_NAME', 'sourcehut');
          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Sourcehut',
            }),
          ]);
        });
        it("doesn't track when the value doesn't match", () => {
          vi.stubEnv('CI_NAME', 'not_the_value');
          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([]);
        });
      });
      describe('Strider CD', () => {
        it('tracks when STRIDER is present', () => {
          vi.stubEnv('STRIDER', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Strider CD',
            }),
          ]);
        });
      });
      describe('TaskCluster', () => {
        it('tracks when TASK_ID is present', () => {
          vi.stubEnv('TASK_ID', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'TaskCluster',
            }),
          ]);
        });
        it('tracks when RUN_ID is present', () => {
          vi.stubEnv('RUN_ID', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'TaskCluster',
            }),
          ]);
        });
      });
      describe('TeamCity', () => {
        it('tracks when TEAMCITY_VERSION is present', () => {
          vi.stubEnv('TEAMCITY_VERSION', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'TeamCity',
            }),
          ]);
        });
      });
      describe('Travis CI', () => {
        it('tracks when TRAVIS is present', () => {
          vi.stubEnv('TRAVIS', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Travis CI',
            }),
          ]);
        });
      });
      describe('Vercel', () => {
        it('tracks when NOW_BUILDER is present', () => {
          vi.stubEnv('NOW_BUILDER', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Vercel',
            }),
          ]);
        });
        it('tracks when VERCEL is present', () => {
          vi.stubEnv('VERCEL', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Vercel',
            }),
          ]);
        });
      });
      describe('Visual Studio App Center', () => {
        it('tracks when APPCENTER is present', () => {
          vi.stubEnv('APPCENTER', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Visual Studio App Center',
            }),
          ]);
        });
      });
      describe('Woodpecker', () => {
        it('tracks when the value matches', () => {
          vi.stubEnv('CI', 'woodpecker');
          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Woodpecker',
            }),
          ]);
        });
        it("doesn't track when the value doesn't match", () => {
          vi.stubEnv('CI', 'not_the_value');
          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([]);
        });
      });
      describe('Xcode Cloud', () => {
        it('tracks when CI_XCODE_PROJECT is present', () => {
          vi.stubEnv('CI_XCODE_PROJECT', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Xcode Cloud',
            }),
          ]);
        });
      });
      describe('Xcode Server', () => {
        it('tracks when XCS is present', () => {
          vi.stubEnv('XCS', '1');

          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({
              key: 'ci',
              value: 'Xcode Server',
            }),
          ]);
        });
      });

      describe('Jenkins', () => {
        it('track nothing if only JENKINS_URL is set', () => {
          vi.stubEnv('JENKINS_URL', 'a_link');
          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([]);
        });
        it('tracks nothing if only BUILD_ID is set', () => {
          vi.stubEnv('BUILD_ID', '1');
          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([]);
        });
        it('tracks if all environment variables are set', () => {
          vi.stubEnv('BUILD_ID', '1');
          vi.stubEnv('JENKINS_URL', 'a_link');
          telemetry.trackCIVendorName();
          expect(telemetryEventStore.readonlyEvents).toMatchObject([
            expect.objectContaining({ key: 'ci', value: 'Jenkins' }),
          ]);
        });
      });
    });
  });
});
