import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import schedules from '../../../../src/commands/schedules';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import {
  useDeleteSchedule,
  useScheduleMutationError,
} from '../../../mocks/schedules';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

describe('schedules delete', () => {
  beforeEach(() => {
    process.env.VERCEL_SCHEDULE_BASE_URL = client.apiUrl;
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'schedules-test-project',
      name: 'schedules-test',
      accountId: 'team_dummy',
    });
    client.cwd = setupUnitFixture('commands/schedules');
  });

  afterEach(() => {
    delete process.env.VERCEL_SCHEDULE_BASE_URL;
    vi.restoreAllMocks();
  });

  it('confirms and deletes from the default namespace', async () => {
    let request;
    useDeleteSchedule('daily-cleanup', value => (request = value));
    const confirm = vi.spyOn(client.input, 'confirm').mockResolvedValue(true);
    client.setArgv('schedules', 'delete', 'daily-cleanup');

    await expect(schedules(client)).resolves.toBe(0);
    expect(confirm).toHaveBeenCalledWith(
      'Delete schedule default/daily-cleanup? This cannot be undone.',
      false
    );
    expect(request).toMatchObject({
      query: {
        namespace: 'default',
        projectId: 'schedules-test-project',
        teamId: 'team_dummy',
      },
    });
    expect(client.stderr.getFullOutput()).toContain(
      'Deleted schedule default/daily-cleanup.'
    );
  });

  it('supports namespace, --yes, and JSON output', async () => {
    let request;
    useDeleteSchedule('daily-cleanup', value => (request = value));
    const confirm = vi.spyOn(client.input, 'confirm');
    client.setArgv(
      'schedules',
      'delete',
      'daily-cleanup',
      '--namespace',
      'jobs',
      '--yes',
      '--json'
    );

    await expect(schedules(client)).resolves.toBe(0);
    expect(confirm).not.toHaveBeenCalled();
    expect(request).toMatchObject({ query: { namespace: 'jobs' } });
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      deleted: true,
      name: 'daily-cleanup',
      namespace: 'jobs',
      scheduleId: 'sch_test',
    });
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:delete', value: 'delete' },
      { key: 'argument:name', value: '[REDACTED]' },
      { key: 'option:namespace', value: '[REDACTED]' },
      { key: 'flag:yes', value: 'TRUE' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it('cancels without deleting', async () => {
    const confirm = vi.spyOn(client.input, 'confirm').mockResolvedValue(false);
    client.setArgv('schedules', 'delete', 'daily-cleanup');

    await expect(schedules(client)).resolves.toBe(0);
    expect(confirm).toHaveBeenCalledOnce();
    expect(client.stderr.getFullOutput()).toContain('Canceled');
  });

  it('requires --yes in non-interactive mode', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    client.nonInteractive = true;
    client.setArgv('schedules', 'delete', 'daily-cleanup');

    await expect(schedules(client)).rejects.toThrow('process.exit called');
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'confirmation_required',
      message:
        'Deleting a schedule requires confirmation. Re-run with `--yes`.',
    });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('writes a bounded success payload in non-interactive mode', async () => {
    useDeleteSchedule('daily-cleanup');
    client.nonInteractive = true;
    client.setArgv('schedules', 'delete', 'daily-cleanup', '--yes');

    await expect(schedules(client)).resolves.toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      status: 'ok',
      deleted: {
        name: 'daily-cleanup',
        namespace: 'default',
        scheduleId: 'sch_test',
      },
      message: 'Deleted schedule default/daily-cleanup.',
    });
  });

  it('maps a missing schedule to the shared not-found error', async () => {
    useScheduleMutationError(
      'delete',
      'missing',
      404,
      'not_found',
      'Schedule not found'
    );
    client.setArgv('schedules', 'delete', 'missing', '--yes');

    await expect(schedules(client)).resolves.toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Schedule not found: default/missing.'
    );
  });

  it('explains that static schedules cannot be deleted', async () => {
    useScheduleMutationError(
      'delete',
      'daily-cleanup',
      409,
      'static_schedule',
      'Static schedules cannot be updated or deleted. Enable or disable them instead.'
    );
    client.setArgv('schedules', 'delete', 'daily-cleanup', '--yes');

    await expect(schedules(client)).resolves.toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      "Static schedule default/daily-cleanup can't be updated or deleted. Enable or disable it instead."
    );
  });

  it('omits --yes from static-schedule recovery commands', async () => {
    useScheduleMutationError(
      'delete',
      'daily-cleanup',
      409,
      'static_schedule',
      'Static schedules cannot be updated or deleted. Enable or disable them instead.'
    );
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    client.nonInteractive = true;
    client.setArgv('schedules', 'delete', 'daily-cleanup', '--yes');

    await expect(schedules(client)).rejects.toThrow('process.exit called');
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'static_schedule',
      next: [
        {
          command: 'vercel schedules enable daily-cleanup --namespace default',
          when: 'Enable the static schedule',
        },
        {
          command: 'vercel schedules disable daily-cleanup --namespace default',
          when: 'Disable the static schedule',
        },
      ],
    });
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
