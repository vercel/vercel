import { beforeEach, describe, expect, it } from 'vitest';
import { TelemetryEventStore } from '../../../src/util/telemetry';
import { RootTelemetryClient } from '../../../src/util/telemetry/root';

describe('error telemetry fields', () => {
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

  it('tracks structured error fields as regular telemetry events', () => {
    telemetry.trackErrorStatus(429);
    telemetry.trackErrorCode('TOO_MANY_REQUESTS');
    telemetry.trackErrorSlug('rate_limited');
    telemetry.trackErrorAction('retry');
    telemetry.trackErrorServerMessage('Rate limited on the requested endpoint');

    expect(telemetryEventStore.readonlyEvents).toMatchObject([
      { key: 'error_status', value: '429' },
      { key: 'error_code', value: 'TOO_MANY_REQUESTS' },
      { key: 'error_slug', value: 'rate_limited' },
      { key: 'error_action', value: 'retry' },
      {
        key: 'error_server_message',
        value: 'Rate limited on the requested endpoint',
      },
    ]);
  });

  it('normalizes and truncates error server messages', () => {
    const longMessage = `${'too-long '.repeat(80)}done`;

    telemetry.trackErrorServerMessage(`  line one\n${longMessage}  `);

    expect(telemetryEventStore.readonlyEvents).toHaveLength(1);
    expect(telemetryEventStore.readonlyEvents[0]?.key).toBe(
      'error_server_message'
    );
    expect(telemetryEventStore.readonlyEvents[0]?.value).not.toContain('\n');
    expect(telemetryEventStore.readonlyEvents[0]?.value.length).toBe(500);
  });
});
