import os from 'node:os';
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import './test/mocks/matchers';
import { TelemetryEventStore } from '../../src/util/telemetry';
import { RootTelemetryClient } from '../../src/util/telemetry/root';
import output from '../../src/output-manager';

import './test/mocks/matchers';

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
  });
});
