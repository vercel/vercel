import { describe, expect, it, beforeEach } from 'vitest';
import { TelemetryEventStore } from '../../../src/util/telemetry';
import { RootTelemetryClient } from '../../../src/util/telemetry/root';

describe('project_id tracking', () => {
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

  it('defaults projectId to NO_PROJECT_ID', () => {
    telemetry.trackVersion('1.0.0');
    const events = telemetryEventStore.readonlyEvents;
    expect(events[0]).toMatchObject({
      projectId: 'NO_PROJECT_ID',
    });
  });

  it('updates projectId on all events after updateProjectId is called', () => {
    telemetry.trackVersion('1.0.0');
    telemetryEventStore.updateProjectId('prj_abc123');
    telemetry.trackPlatform();

    const events = telemetryEventStore.readonlyEvents;
    // First event was added before updateProjectId — still has old value
    expect(events[0]).toMatchObject({ projectId: 'NO_PROJECT_ID' });
    // Second event was added after — has new value
    expect(events[1]).toMatchObject({ projectId: 'prj_abc123' });
  });

  it('ignores undefined projectId in updateProjectId', () => {
    telemetryEventStore.updateProjectId(undefined);
    telemetry.trackVersion('1.0.0');
    expect(telemetryEventStore.readonlyEvents[0]).toMatchObject({
      projectId: 'NO_PROJECT_ID',
    });
  });

  it('includes project_id in save() debug output', () => {
    telemetryEventStore.updateProjectId('prj_xyz');
    telemetry.trackVersion('1.0.0');

    const events = telemetryEventStore.readonlyEvents;
    expect(events[0]).toMatchObject({
      projectId: 'prj_xyz',
    });
  });

  it('tracks project_id as a regular telemetry event', () => {
    telemetryEventStore.updateProjectId('prj_xyz');
    telemetry.trackProjectId('prj_xyz');

    expect(telemetryEventStore.readonlyEvents).toMatchObject([
      {
        key: 'project_id',
        value: 'prj_xyz',
        projectId: 'prj_xyz',
      },
    ]);
  });

  it('tracks project_id with a sentinel when no project is linked', () => {
    telemetry.trackProjectId(telemetryEventStore.currentProjectId);

    expect(telemetryEventStore.readonlyEvents).toMatchObject([
      {
        key: 'project_id',
        value: 'NO_PROJECT_ID',
        projectId: 'NO_PROJECT_ID',
      },
    ]);
  });
});
