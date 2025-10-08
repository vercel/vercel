import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TelemetryEventStore } from '../../../src/util/telemetry';
import { RootTelemetryClient } from '../../../src/util/telemetry/root';

import './test/mocks/matchers';

vi.mock('ci-info', () => {
  return {
    default: {
      id: 'SEE_EYE',
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
      expect(telemetryEventStore.readonlyEvents).toMatchObject([
        {
          key: 'ci',
          // matches mock. vi.mock won't allow a const value in its mocking.
          //  Read more: https://vitest.dev/api/vi.html#vi-mock
          value: 'SEE_EYE',
        },
      ]);
    });
  });
});
