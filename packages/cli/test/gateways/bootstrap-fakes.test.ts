import { join, resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { FakeAgentDetector } from '../fakes/fake-agent-detector';
import { FakeErrorReporter } from '../fakes/fake-error-reporter';
import { FakeTelemetryGateway } from '../fakes/fake-telemetry-gateway';
import { FakeWorkingDirectory } from '../fakes/fake-working-directory';

describe('FakeWorkingDirectory', () => {
  it('changes to relative and absolute directories', () => {
    const cwd = new FakeWorkingDirectory({ cwd: resolve('/work') });

    cwd.change({ dir: 'app' });
    expect(cwd.current()).toBe(join(resolve('/work'), 'app'));

    cwd.change({ dir: resolve('/other') });
    expect(cwd.current()).toBe(resolve('/other'));
  });
});

describe('FakeAgentDetector', () => {
  it('reports no agent by default', async () => {
    await expect(new FakeAgentDetector().detect()).resolves.toEqual({
      isAgent: false,
    });
  });

  it('reports the configured agent', async () => {
    const detector = new FakeAgentDetector({
      isAgent: true,
      agentName: 'claude',
    });

    await expect(detector.detect()).resolves.toEqual({
      isAgent: true,
      agentName: 'claude',
    });
  });
});

describe('FakeTelemetryGateway', () => {
  it('serves the configured identity and plugin marker', () => {
    const telemetry = new FakeTelemetryGateway({
      deviceId: 'device_1',
      session: { id: 'session_1', createdAt: 1, lastSeenAt: 1 },
      pluginMarker: { pluginVersion: '1.2.3' },
    });

    expect(telemetry.loadDeviceId()).toBe('device_1');
    expect(telemetry.loadSession()).toEqual({
      id: 'session_1',
      createdAt: 1,
      lastSeenAt: 1,
    });
    expect(telemetry.readPluginSessionMarker()).toEqual({
      pluginVersion: '1.2.3',
    });
  });

  it('stores touched sessions', () => {
    const telemetry = new FakeTelemetryGateway();
    const session = telemetry.loadSession();

    const touched = telemetry.touchSession({ session });

    expect(touched.id).toBe(session.id);
    expect(touched.lastSeenAt).toBeGreaterThan(session.lastSeenAt);
    expect(telemetry.session).toEqual(touched);
  });

  it('records sent payloads', async () => {
    const telemetry = new FakeTelemetryGateway();
    const payload = { headers: { a: 'b' }, body: [{ key: 'k' }] };

    await telemetry.send({ payload, debug: false });

    expect(telemetry.sent).toEqual([payload]);
  });
});

describe('FakeErrorReporter', () => {
  it('records reported errors', async () => {
    const reporter = new FakeErrorReporter();
    const error = new Error('boom');

    await reporter.report({ error, client: undefined });

    expect(reporter.reported).toEqual([error]);
  });
});
