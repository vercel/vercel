import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelemetryEventStore } from '../../../src/util/telemetry';
import { RootTelemetryClient } from '../../../src/util/telemetry/root';
import {
  captureStdoutErrors,
  createRunTelemetry,
  type RunTelemetryOptions,
} from '../../../src/util/telemetry/agent-run';
import {
  recordCliError,
  takeCliError,
} from '../../../src/util/telemetry/cli-error';
import output from '../../../src/output-manager';
import { client } from '../../mocks/client';

function setup(overrides: Partial<RunTelemetryOptions> = {}) {
  const store = client.telemetryEventStore;
  const telemetry = new RootTelemetryClient({ opts: { store } });
  const save = vi.spyOn(store, 'save');
  const run = createRunTelemetry({
    isAgent: true,
    telemetry,
    store,
    getClient: () => client,
    getConfigIdentity: () => ({}),
    getProjectId: () => undefined,
    ...overrides,
  });
  const values = (key: string) =>
    store.readonlyEvents.filter(e => e.key === key).map(e => e.value);
  const outcomes = () =>
    values('agent_command_outcome').map(v => JSON.parse(v).outcome);
  return { store, run, save, values, outcomes };
}

describe('run telemetry', () => {
  beforeEach(() => {
    client.reset();
    client.isAgent = true;
    client.setArgv('deploy');
    takeCliError();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('trackRunEnd', () => {
    it('sends the recorded error and a failure outcome', () => {
      const { run, values, outcomes } = setup();
      recordCliError({ code: 'not_found', status: 404 });

      run.trackRunEnd(1);

      expect(values('error_code')).toEqual(['not_found']);
      expect(values('error_status')).toEqual(['404']);
      expect(outcomes()).toEqual(['failure']);
    });

    it('sends UNCLASSIFIED_ERROR when a failed run recorded nothing', () => {
      const { run, values } = setup();

      run.trackRunEnd(1);

      expect(values('error_code')).toEqual(['UNCLASSIFIED_ERROR']);
    });

    it('sends no error for a successful run', () => {
      const { run, values, outcomes } = setup();
      recordCliError({ code: 'not_found' });

      run.trackRunEnd(0);

      expect(values('error_code')).toEqual([]);
      expect(outcomes()).toEqual(['success']);
    });

    it('sends a reportOnSuccess error even when the run exits 0', () => {
      const { run, values } = setup();
      recordCliError({ code: 'not_linked', reportOnSuccess: true });

      run.trackRunEnd(0);

      expect(values('error_code')).toEqual(['not_linked']);
    });

    it('sends no error for a --help run', () => {
      client.setArgv('deploy', '--help');
      const { run, values } = setup();

      run.trackRunEnd(2);

      expect(values('error_code')).toEqual([]);
    });

    it('sends no error fields for a human run', () => {
      client.isAgent = false;
      const { run, store } = setup({ isAgent: false });
      recordCliError({ code: 'not_found' });

      run.trackRunEnd(1);

      expect(store.readonlyEvents).toEqual([]);
    });

    it('adds the end-of-run events only once', () => {
      const { run, values, outcomes } = setup();
      recordCliError({ code: 'not_found' });

      run.trackRunEnd(1);
      recordCliError({ code: 'forbidden' });
      run.trackRunEnd(1);

      expect(values('error_code')).toEqual(['not_found']);
      expect(outcomes()).toEqual(['failure']);
    });
  });

  describe('flushOnExit', () => {
    it('saves a run that exited before the normal save, detached', () => {
      const { run, save, values, outcomes } = setup();
      recordCliError({ code: 'invalid_arguments' });

      run.flushOnExit(2);

      expect(values('error_code')).toEqual(['invalid_arguments']);
      expect(outcomes()).toEqual(['failure']);
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith({ detach: true });
    });

    it('does not duplicate events when the exit lands during the normal save lookups', () => {
      const { run, save, values, outcomes } = setup();
      recordCliError({ code: 'not_found' });

      // Normal path: end-of-run events added, then the user and project
      // lookups are awaited before `markSaveStarted()`
      run.trackRunEnd(1);
      run.flushOnExit(1);

      expect(values('error_code')).toEqual(['not_found']);
      expect(outcomes()).toEqual(['failure']);
      expect(save).toHaveBeenCalledTimes(1);
    });

    it('does nothing once the normal save has started', () => {
      const { run, save, store } = setup();
      run.trackRunEnd(0);
      run.markSaveStarted();
      const eventCount = store.readonlyEvents.length;

      run.flushOnExit(0);

      expect(save).not.toHaveBeenCalled();
      expect(store.readonlyEvents).toHaveLength(eventCount);
    });

    it('saves only once if called twice', () => {
      const { run, save } = setup();

      run.flushOnExit(1);
      run.flushOnExit(1);

      expect(save).toHaveBeenCalledTimes(1);
    });

    it('uses the config identity and project when there is no client yet', () => {
      const { run, store } = setup({
        getClient: () => undefined,
        getConfigIdentity: () => ({ teamId: 'team_1', userId: 'user_1' }),
        getProjectId: () => 'prj_1',
      });
      const updateTeamId = vi.spyOn(store, 'updateTeamId');
      const updateUserId = vi.spyOn(store, 'updateUserId');

      run.flushOnExit(1);

      expect(updateTeamId).toHaveBeenCalledWith('team_1');
      expect(updateUserId).toHaveBeenCalledWith('user_1');
      expect(store.currentProjectId).toBe('prj_1');
    });

    it('still saves when the identity or project lookup throws', () => {
      const { run, save, values } = setup({
        getConfigIdentity: () => {
          throw new Error('config went away');
        },
        getProjectId: () => {
          throw new Error('Both .vercel and .now directories exist');
        },
      });
      recordCliError({ code: 'not_found' });

      run.flushOnExit(1);

      expect(values('error_code')).toEqual(['not_found']);
      expect(save).toHaveBeenCalledWith({ detach: true });
    });

    it('never throws at exit', () => {
      const { run, save } = setup({
        getConfigIdentity: () => {
          throw new Error('config went away');
        },
      });
      save.mockImplementation(() => {
        throw new Error('spawn failed');
      });

      expect(() => run.flushOnExit(1)).not.toThrow();
    });
  });
});

describe('captureStdoutErrors', () => {
  beforeEach(() => {
    takeCliError();
  });

  function fakeStream() {
    const written: unknown[] = [];
    const stream = {
      write: vi.fn((chunk: unknown) => {
        written.push(chunk);
        return true;
      }),
    } as unknown as NodeJS.WriteStream;
    return { stream, written };
  }

  it('records an agent error payload and writes it unchanged', () => {
    const { stream, written } = fakeStream();
    captureStdoutErrors(stream);
    const payload = `${JSON.stringify(
      { status: 'error', reason: 'deployment_canceled', message: 'Canceled' },
      null,
      2
    )}\n`;

    expect(stream.write(payload)).toBe(true);

    expect(written).toEqual([payload]);
    expect(takeCliError()).toMatchObject({ code: 'deployment_canceled' });
  });

  it('passes other output through without recording', () => {
    const { stream, written } = fakeStream();
    captureStdoutErrors(stream);

    stream.write('Deployed to https://example.vercel.app\n');
    stream.write(JSON.stringify({ id: 'dpl_1', readyState: 'READY' }));

    expect(written).toHaveLength(2);
    expect(takeCliError()).toBeUndefined();
  });

  it('can be removed', () => {
    const { stream } = fakeStream();
    const original = stream.write;
    const restore = captureStdoutErrors(stream);

    restore();
    stream.write(JSON.stringify({ status: 'error', reason: 'x' }));

    expect(stream.write).toBe(original);
    expect(takeCliError()).toBeUndefined();
  });
});

describe('TelemetryEventStore.save detach', () => {
  afterEach(() => {
    output.initialize({ debug: false });
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([
    [{}, true],
    [{ detach: true }, false],
  ])('with --debug and %o, waits for the subprocess: %s', async (opts, waits) => {
    vi.stubEnv('VERCEL_TELEMETRY_DISABLED', undefined);
    output.initialize({ debug: true });
    const store = new TelemetryEventStore({ config: { enabled: true } });
    new RootTelemetryClient({ opts: { store } }).trackPlatform();
    const send = vi.spyOn(store, 'sendToSubprocess').mockResolvedValue();

    await store.save(opts);

    expect(send).toHaveBeenCalledWith(expect.any(Object), waits);
  });
});
