import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SCHEDULES_BASE_URL,
  SCHEDULES_REQUEST_SOURCE_HEADER,
  SchedulesClient,
} from '../../../../src/util/schedules/client';
import { client } from '../../../mocks/client';
import {
  createSchedule,
  createScheduleExecution,
  createScheduleExecutionMetrics,
} from '../../../mocks/schedules';

describe('SchedulesClient', () => {
  beforeEach(() => {
    client.scenario.get('/v1/schedules/:name', (req, res) => {
      expect(req.params.name).toBe('daily.cleanup');
      expect(req.query).toMatchObject({
        projectId: 'prj_123',
        namespace: 'jobs',
        teamId: 'team_123',
      });
      expect(req.headers.authorization).toBe('Bearer token_dummy');
      expect(req.headers[SCHEDULES_REQUEST_SOURCE_HEADER]).toBe('cli');
      res.json({
        ...createSchedule({
          projectId: 'prj_123',
          ownerId: 'team_123',
          name: 'daily.cleanup',
          namespace: 'jobs',
        }),
        trackId: 'production',
      });
    });
    client.scenario.get('/v1/schedules', (req, res) => {
      expect(req.query).toMatchObject({
        projectId: 'prj_123',
        namespace: 'jobs',
        cursor: 'cursor_123',
        limit: '5',
        teamId: 'team_123',
      });
      expect(req.headers.authorization).toBe('Bearer token_dummy');
      res.json({
        data: [
          {
            ...createSchedule({
              projectId: 'prj_123',
              ownerId: 'team_123',
              name: 'daily.cleanup',
              namespace: 'jobs',
            }),
            trackId: 'production',
          },
        ],
        cursor: 'cursor_456',
      });
    });
    client.scenario.get('/v1/schedules/:name/executions', (req, res) => {
      expect(req.params.name).toBe('daily.cleanup');
      expect(req.query).toMatchObject({
        projectId: 'prj_123',
        namespace: 'jobs',
        cursor: 'cursor_123',
        limit: '5',
        sort: 'asc',
        from: '1700000000000',
        to: '1700086400000',
        executionId: 'schx_abc',
        teamId: 'team_123',
      });
      expect(req.headers.authorization).toBe('Bearer token_dummy');
      res.json({
        data: [createScheduleExecution()],
        cursor: 'cursor_456',
        metrics: createScheduleExecutionMetrics(),
      });
    });
    client.scenario.delete('/v1/schedules/:name', (req, res) => {
      expect(req.params.name).toBe('daily.cleanup');
      expect(req.query).toMatchObject({
        projectId: 'prj_123',
        namespace: 'jobs',
        teamId: 'team_123',
      });
      res.status(200).json({ scheduleId: 'sch_test' });
    });
  });

  it('uses the production Schedules API by default', () => {
    expect(DEFAULT_SCHEDULES_BASE_URL).toBe('https://vercel-schedules.com');
  });

  it('gets a schedule with bearer-token project scope', async () => {
    const schedules = new SchedulesClient(client, {
      ownerId: 'team_123',
      projectId: 'prj_123',
      baseUrl: client.apiUrl,
    });

    const schedule = await schedules.get({
      name: 'daily.cleanup',
      namespace: 'jobs',
    });

    expect(schedule).toMatchObject({
      projectId: 'prj_123',
      name: 'daily.cleanup',
      namespace: 'jobs',
    });
    expect(schedule).not.toHaveProperty('trackId');
  });

  it('lists schedules with bearer-token project scope', async () => {
    const schedules = new SchedulesClient(client, {
      ownerId: 'team_123',
      projectId: 'prj_123',
      baseUrl: client.apiUrl,
    });

    const result = await schedules.list({
      namespace: 'jobs',
      cursor: 'cursor_123',
      limit: 5,
    });

    expect(result).toMatchObject({
      data: [
        {
          projectId: 'prj_123',
          name: 'daily.cleanup',
          namespace: 'jobs',
        },
      ],
      cursor: 'cursor_456',
    });
    expect(result.data[0]).not.toHaveProperty('trackId');
  });

  it('lists executions with bearer-token project scope', async () => {
    const schedules = new SchedulesClient(client, {
      ownerId: 'team_123',
      projectId: 'prj_123',
      baseUrl: client.apiUrl,
    });

    const result = await schedules.listExecutions({
      name: 'daily.cleanup',
      namespace: 'jobs',
      cursor: 'cursor_123',
      limit: 5,
      sort: 'asc',
      from: 1_700_000_000_000,
      to: 1_700_086_400_000,
      executionId: 'schx_abc',
    });

    expect(result).toEqual({
      data: [createScheduleExecution()],
      cursor: 'cursor_456',
      metrics: createScheduleExecutionMetrics(),
    });
  });

  it('returns the delete receipt from the Schedules API', async () => {
    const schedules = new SchedulesClient(client, {
      ownerId: 'team_123',
      projectId: 'prj_123',
      baseUrl: client.apiUrl,
    });

    await expect(
      schedules.delete({ name: 'daily.cleanup', namespace: 'jobs' })
    ).resolves.toEqual({ scheduleId: 'sch_test' });
  });
});
