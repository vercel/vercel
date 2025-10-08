import { describe, expect, it, vi, beforeEach } from 'vitest';
import './test/mocks/matchers';
import { TelemetryEventStore } from '../../../src/util/telemetry';
import { RootTelemetryClient } from '../../../src/util/telemetry/root';

import './test/mocks/matchers';

vi.mock('ci-info', () => {
  return {
    default: {
      // value used by ci-info to indicate unknown CI
      id: null,
    },
  };
});

describe('CI Vendor Name', () => {
  describe('telemetry run in CI', () => {
    let telemetry: RootTelemetryClient;
    let telemetryEventStore: TelemetryEventStore;
    beforeEach(() => {
      telemetryEventStore = new TelemetryEventStore({
        isDebug: true,
        config: {
          enabled: true,
        },
      });

      telemetry = new RootTelemetryClient({
        opts: {
          store: telemetryEventStore,
        },
      });
    });

    it('delegates to ci-info library', () => {
      telemetry.trackCIVendorName();
      expect(telemetryEventStore.readonlyEvents).toMatchObject([]);
    });
  });
});
