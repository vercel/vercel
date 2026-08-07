import os from 'node:os';
import { spawn } from 'node:child_process';
import {
  describe,
  expect,
  it,
  vi,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
} from 'vitest';
import { TelemetryEventStore } from '../../src/util/telemetry';
import { RootTelemetryClient } from '../../src/util/telemetry/root';
import output from '../../src/output-manager';

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(() => ({ unref: vi.fn() })),
  };
});

import './test/mocks/matchers/index';

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe('main', () => {
  describe('telemetry', () => {
    beforeAll(() => {
      output.initialize({
        debug: true,
      });
    });

    afterAll(() => {
      output.initialize({
        debug: false,
      });
      vi.restoreAllMocks();
    });

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
      const telemetryEventStore = new TelemetryEventStore({
        isDebug: true,
        config: {},
      });

      const telemetry = new RootTelemetryClient({
        opts: {
          store: telemetryEventStore,
        },
      });
      telemetry.trackCPUs();
      expect(telemetryEventStore).toHaveTelemetryEvents([
        { key: 'cpu_count', value: '1' },
      ]);
    });

    it('tracks platform', () => {
      vi.spyOn(os, 'platform').mockImplementation(() => 'linux');

      const telemetryEventStore = new TelemetryEventStore({
        isDebug: true,
        config: {},
      });

      const telemetry = new RootTelemetryClient({
        opts: {
          store: telemetryEventStore,
        },
      });
      telemetry.trackPlatform();
      expect(telemetryEventStore).toHaveTelemetryEvents([
        { key: 'platform', value: 'linux' },
      ]);
    });

    it('tracks arch', () => {
      vi.spyOn(os, 'arch').mockImplementation(() => 'x86');

      const telemetryEventStore = new TelemetryEventStore({
        isDebug: true,
        config: {},
      });

      const telemetry = new RootTelemetryClient({
        opts: {
          store: telemetryEventStore,
        },
      });
      telemetry.trackArch();
      expect(telemetryEventStore).toHaveTelemetryEvents([
        { key: 'arch', value: 'x86' },
      ]);
    });

    describe('version', () => {
      it('tracks nothing when version is empty', () => {
        const telemetryEventStore = new TelemetryEventStore({
          isDebug: true,
          config: {},
        });

        const telemetry = new RootTelemetryClient({
          opts: {
            store: telemetryEventStore,
          },
        });

        telemetry.trackVersion(undefined);
        expect(telemetryEventStore).toHaveTelemetryEvents([]);
      });

      it('tracks version', () => {
        const telemetryEventStore = new TelemetryEventStore({
          isDebug: true,
          config: {},
        });

        const telemetry = new RootTelemetryClient({
          opts: {
            store: telemetryEventStore,
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

        const telemetryEventStore = new TelemetryEventStore({
          isDebug: true,
          config: configThatWillBeIgnoredAnyway,
        });

        expect(telemetryEventStore.enabled).toBe(false);
      });
    });

    describe('save', () => {
      describe('when VERCEL_TELEMETRY_DEBUG is disabled', () => {
        describe('when output debug is disabled', () => {
          beforeEach(() => {
            output.initialize({
              debug: false,
            });
            vi.stubEnv('VERCEL_TELEMETRY_DISABLED', undefined);
          });
          afterEach(() => {
            output.initialize({
              debug: true,
            });
          });
          it('sends the event to the subprocess with the expected payload', async () => {
            const telemetryEventStore = new TelemetryEventStore({
              isDebug: false,
              config: {},
            });
            const spy = vi
              .spyOn(telemetryEventStore, 'sendToSubprocess')
              .mockImplementation(async () => {
                // Prevent the actual call to the subprocess from happening
              });

            const telemetry = new RootTelemetryClient({
              opts: {
                store: telemetryEventStore,
              },
            });
            telemetry.trackPlatform();
            telemetry.trackArch();

            await telemetryEventStore.save();

            expect(spy).toHaveBeenCalledWith(
              expect.objectContaining({
                headers: expect.objectContaining({
                  'x-vercel-cli-topic-id': 'generic',
                  'x-vercel-cli-session-id': expect.any(String),
                }),
                body: expect.arrayContaining([
                  expect.objectContaining({
                    event_time: expect.any(Number),
                    id: expect.any(String),
                    key: expect.any(String),
                    value: expect.any(String),
                    team_id: expect.any(String),
                  }),
                ]),
              }),
              expect.any(Boolean)
            );
          });
        });
      });
    });

    describe('sendToSubprocess', () => {
      const payload = { headers: {}, body: [] };

      beforeEach(() => {
        vi.mocked(spawn).mockClear();
      });

      it('re-invokes the CLI script through Node when running from source', async () => {
        const telemetryEventStore = new TelemetryEventStore({
          isDebug: false,
          config: {},
        });

        await telemetryEventStore.sendToSubprocess(payload, false);

        expect(spawn).toHaveBeenCalledTimes(1);
        const [binary, args] = vi.mocked(spawn).mock.calls[0];
        expect(binary).toBe(process.argv[0]);
        expect(args).toEqual([
          process.argv[1],
          'telemetry',
          'flush',
          JSON.stringify(payload),
        ]);
      });

      it('omits the script path when running as the native binary', async () => {
        // In the standalone binary, process.argv[1] is a virtual snapshot
        // path; passing it as an argument would be parsed as a deploy path.
        vi.stubEnv('VERCEL_VC_NATIVE', '1');
        const telemetryEventStore = new TelemetryEventStore({
          isDebug: false,
          config: {},
        });

        await telemetryEventStore.sendToSubprocess(payload, false);

        expect(spawn).toHaveBeenCalledTimes(1);
        const [binary, args] = vi.mocked(spawn).mock.calls[0];
        expect(binary).toBe(process.execPath);
        expect(args).toEqual(['telemetry', 'flush', JSON.stringify(payload)]);
      });
    });
  });
});
