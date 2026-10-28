import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { TelemetryEventStore } from '../../../src/util/telemetry';
import { RootTelemetryClient } from '../../../src/util/telemetry/root';
import {
  trackAgentCommandOutcome,
  trackAgentError,
} from '../../../src/util/telemetry/agent-error';
import { client } from '../../mocks/client';
import output from '../../../src/output-manager';

describe('invocation_id tracking', () => {
  let telemetry: RootTelemetryClient;
  let telemetryEventStore: TelemetryEventStore;

  beforeEach(() => {
    vi.stubEnv('VERCEL_TELEMETRY_DISABLED', undefined);
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

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('tracks invocation_id as a regular telemetry event', () => {
    telemetry.trackInvocationId(telemetryEventStore.currentInvocationId);

    expect(telemetryEventStore.readonlyEvents).toMatchObject([
      {
        invocationId: telemetryEventStore.currentInvocationId,
        key: 'invocation_id',
        value: telemetryEventStore.currentInvocationId,
      },
    ]);
  });

  it('decorates root, command, option, flag and directly added events', () => {
    telemetry.trackPlatform();
    telemetry.trackArch();
    telemetry.trackCliCommandDeploy('deploy');
    telemetry.trackCliOptionScope('team');
    telemetry.trackCliFlagHelp('deploy');
    telemetryEventStore.add({
      id: randomUUID(),
      eventTime: Date.now(),
      key: 'custom',
      value: 'value',
    });

    const events = telemetryEventStore.readonlyEvents;
    expect(events).toHaveLength(6);
    expect(new Set(events.map(event => event.invocationId))).toEqual(
      new Set([telemetryEventStore.currentInvocationId])
    );
    expect(new Set(events.map(event => event.id)).size).toBe(events.length);
  });

  it('keeps concurrent invocations distinct within the same session', async () => {
    const filePath = join(tmpdir(), `cli-invocation-${randomUUID()}.json`);
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const createStore = () =>
      new TelemetryEventStore({
        config: { enabled: true },
        cliSession: { filePath },
      });

    try {
      const first = createStore();
      const second = createStore();
      const firstSend = vi.spyOn(first, 'sendToSubprocess').mockResolvedValue();
      const secondSend = vi
        .spyOn(second, 'sendToSubprocess')
        .mockResolvedValue();
      const firstTelemetry = new RootTelemetryClient({
        opts: { store: first },
      });
      const secondTelemetry = new RootTelemetryClient({
        opts: { store: second },
      });
      firstTelemetry.trackInvocationId(first.currentInvocationId);
      secondTelemetry.trackInvocationId(second.currentInvocationId);
      firstTelemetry.trackArch();
      secondTelemetry.trackPlatform();
      firstTelemetry.trackVersion('1.0.0');
      secondTelemetry.trackVersion('2.0.0');

      expect(first.currentSessionId).toBe(second.currentSessionId);
      expect(first.currentInvocationId).not.toBe(second.currentInvocationId);
      await second.save();
      await first.save();

      for (const [store, send] of [
        [first, firstSend],
        [second, secondSend],
      ] as const) {
        expect(send).toHaveBeenCalledWith(
          expect.objectContaining({
            invocationId: store.currentInvocationId,
            headers: expect.objectContaining({
              'x-vercel-cli-session-id': first.currentSessionId,
            }),
            body: store.readonlyEvents.map(event =>
              expect.objectContaining({
                id: event.id,
                invocation_id: store.currentInvocationId,
                event_time: 1_000,
                key: event.key,
                value: event.value,
              })
            ),
          }),
          expect.any(Boolean)
        );
      }
    } finally {
      rmSync(filePath, { force: true });
    }
  });

  it('preserves ownership and buffered events across repeated saves and reset', async () => {
    const store = new TelemetryEventStore({ config: { enabled: true } });
    const send = vi.spyOn(store, 'sendToSubprocess').mockResolvedValue();
    const root = new RootTelemetryClient({ opts: { store } });
    const invocationId = store.currentInvocationId;
    root.trackPlatform();
    const originalEvents = structuredClone(store.readonlyEvents);

    await store.save();
    await store.save();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toEqual(send.mock.calls[0][0]);
    expect(store.readonlyEvents).toEqual(originalEvents);
    expect(send.mock.calls[0][0]).toMatchObject({
      invocationId,
      body: [{ invocation_id: invocationId }],
    });
    const serialized = JSON.stringify(send.mock.calls[0][0]);
    expect(JSON.parse(serialized).body[0]).not.toHaveProperty('invocationId');

    store.reset();
    await store.save();
    expect(send).toHaveBeenCalledTimes(2);
    root.trackArch();
    await store.save();
    expect(store.currentInvocationId).toBe(invocationId);
    expect(send.mock.calls[2][0]).toMatchObject({
      invocationId,
      body: [{ invocation_id: invocationId, key: 'arch' }],
    });
    expect(JSON.stringify(send.mock.calls[0][0])).toBe(serialized);
  });

  it('matches the invocation IDs embedded in agent errors and outcomes', () => {
    client.isAgent = true;
    const store = client.telemetryEventStore;
    store.reset();
    trackAgentError(client, { reason: 'not_authorized' });
    trackAgentCommandOutcome(client, 1);

    expect(store.readonlyEvents).toHaveLength(2);
    for (const event of store.readonlyEvents) {
      expect(event.invocationId).toBe(store.currentInvocationId);
      expect(JSON.parse(event.value).invocationId).toBe(event.invocationId);
    }
  });

  it('includes invocation identity in debug events without spawning a flush', async () => {
    const log = vi.spyOn(output, 'log').mockImplementation(() => undefined);
    const send = vi
      .spyOn(telemetryEventStore, 'sendToSubprocess')
      .mockResolvedValue();
    telemetry.trackPlatform();
    await telemetryEventStore.save();
    expect(log).toHaveBeenCalledWith(
      JSON.stringify(telemetryEventStore.readonlyEvents[0])
    );
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    'config',
    'environment',
  ])('preserves the %s telemetry opt-out', async mode => {
    const store = new TelemetryEventStore({
      config: { enabled: mode !== 'config' },
    });
    if (mode === 'environment') vi.stubEnv('VERCEL_TELEMETRY_DISABLED', '1');
    const send = vi.spyOn(store, 'sendToSubprocess').mockResolvedValue();
    new RootTelemetryClient({ opts: { store } }).trackPlatform();
    await store.save();
    expect(send).not.toHaveBeenCalled();
  });
});
