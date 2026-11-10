import { describe, expect, it, beforeEach } from 'vitest';
import { TelemetryEventStore } from '../../../../src/util/telemetry';
import { RootTelemetryClient } from '../../../../src/util/telemetry/root';

// The root-level `command:*` event is emitted from src/index.ts, which the
// other connex tests bypass by calling the subcommand entrypoint directly.
// That gap let the emitted name drift from the user-facing command for three
// months (keyed `connex` while the CLI shipped `vercel connect`), so pin it
// here.
describe('connect root command telemetry', () => {
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

  it('emits the user-facing command name, not the internal `connex`', () => {
    telemetry.trackCliCommandConnex('connect');

    expect(telemetryEventStore.readonlyEvents).toMatchObject([
      {
        key: 'command:connect',
        value: 'connect',
      },
    ]);
  });

  it('does not emit a `command:connex` key', () => {
    telemetry.trackCliCommandConnex('connect');

    expect(telemetryEventStore.readonlyEvents).not.toMatchObject([
      {
        key: 'command:connex',
      },
    ]);
  });
});
