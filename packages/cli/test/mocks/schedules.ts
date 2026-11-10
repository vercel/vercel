import type {
  ListExecutionsResponse,
  ListSchedulesResponse,
  Schedule,
  ScheduleExecution,
  ScheduleExecutionMetrics,
} from '../../src/util/schedules/types';
import { client } from './client';

type ScheduleRequest = {
  body: Record<string, unknown>;
  query: Record<string, unknown>;
};

export function createSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    scheduleId: 'sch_test',
    ownerId: 'team_dummy',
    projectId: 'schedules-test-project',
    name: 'daily-cleanup',
    namespace: 'default',
    timezone: 'UTC',
    expression: { type: 'cron', cron: '0 2 * * *' },
    jitter: 5,
    target: { type: 'queue', topic: 'scheduled-cleanup' },
    state: 'active',
    source: 'dynamic',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_100_000,
    ...overrides,
  };
}

export function useSchedule(
  name = 'daily-cleanup',
  overrides: Partial<Schedule> = {},
  onRequest?: (query: Record<string, unknown>) => void
): Schedule {
  const schedule = createSchedule({ name, ...overrides });

  client.scenario.get(
    `/v1/schedules/${encodeURIComponent(name)}`,
    (req, res) => {
      onRequest?.(req.query as Record<string, unknown>);
      res.json({ ...schedule, trackId: 'production' });
    }
  );

  return schedule;
}

export function useScheduleNotFound(name: string): void {
  useScheduleError(name, 404, 'not_found', 'Schedule not found');
}

export function useScheduleError(
  name: string,
  status: number,
  code: string,
  message: string
): void {
  client.scenario.get(
    `/v1/schedules/${encodeURIComponent(name)}`,
    (_req, res) => {
      res.status(status).json({
        error: { code, message },
      });
    }
  );
}

export function useSchedules(
  schedules: Schedule[] = [createSchedule()],
  cursor: string | null = null,
  onRequest?: (query: Record<string, unknown>) => void
): ListSchedulesResponse {
  client.scenario.get('/v1/schedules', (req, res) => {
    onRequest?.(req.query as Record<string, unknown>);
    res.json({
      data: schedules.map(schedule => ({
        ...schedule,
        trackId: 'production',
      })),
      cursor,
    });
  });

  return { data: schedules, cursor };
}

export function createScheduleExecution(
  overrides: Partial<ScheduleExecution> = {}
): ScheduleExecution {
  return {
    executionId: 'schx_test123',
    invokeSource: 'scheduled',
    status: 'succeeded',
    firedAt: 1_700_000_000_500,
    ...overrides,
  };
}

export function createScheduleExecutionMetrics(
  overrides: Partial<ScheduleExecutionMetrics> = {}
): ScheduleExecutionMetrics {
  return {
    from: 1_699_913_700_000,
    to: 1_700_000_100_000,
    recordedInvocations: 10,
    failedInvocations: 2,
    errorRate: 0.2,
    averageDurationMs: 125,
    ...overrides,
  };
}

export function useScheduleExecutions(
  name: string,
  executions: ScheduleExecution[] = [createScheduleExecution()],
  cursor: string | null = null,
  onRequest?: (query: Record<string, unknown>) => void,
  metrics: ScheduleExecutionMetrics = createScheduleExecutionMetrics()
): ListExecutionsResponse {
  client.scenario.get(
    `/v1/schedules/${encodeURIComponent(name)}/executions`,
    (req, res) => {
      onRequest?.(req.query as Record<string, unknown>);
      res.json({ data: executions, cursor, metrics });
    }
  );

  return { data: executions, cursor, metrics };
}

export function useScheduleExecutionsError(
  name: string,
  status: number,
  code: string,
  message: string
): void {
  client.scenario.get(
    `/v1/schedules/${encodeURIComponent(name)}/executions`,
    (_req, res) => {
      res.status(status).json({
        error: { code, message },
      });
    }
  );
}

export function useSchedulesError(
  status: number,
  code: string,
  message: string
): void {
  client.scenario.get('/v1/schedules', (_req, res) => {
    res.status(status).json({
      error: { code, message },
    });
  });
}

export function useCreateSchedule(
  schedule: Schedule = createSchedule(),
  onRequest?: (request: ScheduleRequest) => void
): Schedule {
  client.scenario.post('/v1/schedules', (req, res) => {
    onRequest?.({
      body: req.body as Record<string, unknown>,
      query: req.query as Record<string, unknown>,
    });
    res.status(201).json({ ...schedule, trackId: 'production' });
  });
  return schedule;
}

export function useUpdateSchedule(
  name: string,
  schedule: Schedule = createSchedule({ name }),
  onRequest?: (request: ScheduleRequest) => void
): Schedule {
  client.scenario.patch(
    `/v1/schedules/${encodeURIComponent(name)}`,
    (req, res) => {
      onRequest?.({
        body: req.body as Record<string, unknown>,
        query: req.query as Record<string, unknown>,
      });
      res.json({ ...schedule, trackId: 'production' });
    }
  );
  return schedule;
}

export function useDeleteSchedule(
  name: string,
  onRequest?: (request: ScheduleRequest) => void
): void {
  client.scenario.delete(
    `/v1/schedules/${encodeURIComponent(name)}`,
    (req, res) => {
      onRequest?.({
        body: req.body as Record<string, unknown>,
        query: req.query as Record<string, unknown>,
      });
      res.status(200).json({ scheduleId: 'sch_test' });
    }
  );
}

export function useScheduleAction(
  action: 'enable' | 'disable' | 'invoke',
  name: string,
  schedule: Schedule = createSchedule({ name }),
  onRequest?: (request: ScheduleRequest) => void
): void {
  client.scenario.post(
    `/v1/schedules/${encodeURIComponent(name)}/${action}`,
    (req, res) => {
      onRequest?.({
        body: req.body as Record<string, unknown>,
        query: req.query as Record<string, unknown>,
      });
      if (action === 'invoke') {
        res.status(204).end();
      } else {
        res.json({ ...schedule, trackId: 'production' });
      }
    }
  );
}

export function useScheduleMutationError(
  action: 'create' | 'update' | 'enable' | 'disable' | 'invoke' | 'delete',
  name: string,
  status: number,
  code: string,
  message: string
): void {
  const path =
    action === 'create'
      ? '/v1/schedules'
      : `/v1/schedules/${encodeURIComponent(name)}${
          action === 'update' || action === 'delete' ? '' : `/${action}`
        }`;
  if (action === 'update') {
    client.scenario.patch(path, (_req, res) => {
      res.status(status).json({ error: { code, message } });
    });
  } else if (action === 'delete') {
    client.scenario.delete(path, (_req, res) => {
      res.status(status).json({ error: { code, message } });
    });
  } else {
    client.scenario.post(path, (_req, res) => {
      res.status(status).json({ error: { code, message } });
    });
  }
}
