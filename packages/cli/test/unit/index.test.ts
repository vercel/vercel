import { describe, expect, it, vi } from 'vitest';
import os from 'node:os';

import { Output } from '../../src/util/output';
import { TelemetryEventStore } from '../../src/util/telemetry';
import { TelemetryBaseClient } from '../../src/util/telemetry/base';

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

      const telemetry = new TelemetryBaseClient({
        opts: {
          store: telemetryEventStore,
          output,
        },
      });
      telemetry.trackCPUs();
      expect(telemetryEventStore).toHaveTelemetryEvents([
        { key: 'cpu', value: '1' },
      ]);
    });
  });
});
