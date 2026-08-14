import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, describe, expect, it } from 'vitest';
import { TelemetryEventStore } from '../../../src/util/telemetry';
import { RootTelemetryClient } from '../../../src/util/telemetry/root';

describe('persisted cli telemetry session', () => {
  let sessionFilePath: string;

  beforeEach(() => {
    sessionFilePath = join(
      tmpdir(),
      `vercel-cli-telemetry-session-${randomUUID()}.json`
    );
    rmSync(sessionFilePath, { force: true });
  });

  it('reuses the same session within the inactivity timeout', async () => {
    let now = 0;
    const nowFn = () => now;

    const firstStore = new TelemetryEventStore({
      config: { enabled: true },
      isDebug: true,
      cliSession: {
        filePath: sessionFilePath,
        now: nowFn,
      },
    });
    const firstTelemetry = new RootTelemetryClient({
      opts: {
        store: firstStore,
      },
    });
    firstTelemetry.trackVersion('1.0.0');
    const firstSessionId = firstStore.readonlyEvents[0]?.sessionId;

    now = 20 * 60 * 1000;
    await firstStore.save();

    now = 45 * 60 * 1000;
    const secondStore = new TelemetryEventStore({
      config: { enabled: true },
      isDebug: true,
      cliSession: {
        filePath: sessionFilePath,
        now: nowFn,
      },
    });
    const secondTelemetry = new RootTelemetryClient({
      opts: {
        store: secondStore,
      },
    });
    secondTelemetry.trackPlatform();
    const secondSessionId = secondStore.readonlyEvents[0]?.sessionId;

    expect(secondSessionId).toBe(firstSessionId);
  });

  it('rotates the session after the inactivity timeout', () => {
    let now = 0;
    const nowFn = () => now;

    const firstStore = new TelemetryEventStore({
      config: { enabled: true },
      isDebug: true,
      cliSession: {
        filePath: sessionFilePath,
        now: nowFn,
      },
    });
    const firstTelemetry = new RootTelemetryClient({
      opts: {
        store: firstStore,
      },
    });
    firstTelemetry.trackVersion('1.0.0');
    const firstSessionId = firstStore.readonlyEvents[0]?.sessionId;

    now = 31 * 60 * 1000;
    const secondStore = new TelemetryEventStore({
      config: { enabled: true },
      isDebug: true,
      cliSession: {
        filePath: sessionFilePath,
        now: nowFn,
      },
    });
    const secondTelemetry = new RootTelemetryClient({
      opts: {
        store: secondStore,
      },
    });
    secondTelemetry.trackPlatform();
    const secondSessionId = secondStore.readonlyEvents[0]?.sessionId;

    expect(secondSessionId).not.toBe(firstSessionId);
  });

  it('rotates the session after the max lifetime even with activity', async () => {
    let now = 0;
    const nowFn = () => now;

    const firstStore = new TelemetryEventStore({
      config: { enabled: true },
      isDebug: true,
      cliSession: {
        filePath: sessionFilePath,
        now: nowFn,
      },
    });
    const firstTelemetry = new RootTelemetryClient({
      opts: {
        store: firstStore,
      },
    });
    firstTelemetry.trackVersion('1.0.0');
    const firstSessionId = firstStore.readonlyEvents[0]?.sessionId;

    now = 23 * 60 * 60 * 1000;
    await firstStore.save();

    now = 25 * 60 * 60 * 1000;
    const secondStore = new TelemetryEventStore({
      config: { enabled: true },
      isDebug: true,
      cliSession: {
        filePath: sessionFilePath,
        now: nowFn,
      },
    });
    const secondTelemetry = new RootTelemetryClient({
      opts: {
        store: secondStore,
      },
    });
    secondTelemetry.trackPlatform();
    const secondSessionId = secondStore.readonlyEvents[0]?.sessionId;

    expect(secondSessionId).not.toBe(firstSessionId);
  });
});
