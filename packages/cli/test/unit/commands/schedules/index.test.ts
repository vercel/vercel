import stripAnsi from 'strip-ansi';
import { beforeEach, describe, expect, it } from 'vitest';
import schedules from '../../../../src/commands/schedules';
import { client } from '../../../mocks/client';

describe('schedules', () => {
  beforeEach(() => {
    client.setArgv('schedules');
  });

  it('shows help when called without a subcommand', async () => {
    await expect(schedules(client)).resolves.toBe(0);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'vercel schedules <command>'
    );
    expect(stripAnsi(client.stderr.getFullOutput())).toMatch(
      /inspect\s+<name>\s+Show a schedule/
    );
    expect(stripAnsi(client.stderr.getFullOutput())).toContain('list');
    expect(stripAnsi(client.stderr.getFullOutput())).toContain('executions');
    expect(stripAnsi(client.stderr.getFullOutput())).toContain('create');
    expect(stripAnsi(client.stderr.getFullOutput())).toContain('delete');
    expect(stripAnsi(client.stderr.getFullOutput())).toContain('update');
    expect(stripAnsi(client.stderr.getFullOutput())).toContain('enable');
    expect(stripAnsi(client.stderr.getFullOutput())).toContain('disable');
    expect(stripAnsi(client.stderr.getFullOutput())).toContain('invoke');
    expect(stripAnsi(client.stderr.getFullOutput())).not.toContain(
      'Please specify a valid subcommand'
    );
  });

  it('shows help for an invalid subcommand', async () => {
    client.setArgv('schedules', 'unknown');
    await expect(schedules(client)).resolves.toBe(0);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'Please specify a valid subcommand: create | delete | disable | enable | executions | inspect | invoke | list | update'
    );
    expect(stripAnsi(client.stderr.getFullOutput())).toMatch(
      /inspect\s+<name>\s+Show a schedule/
    );
  });

  it('tracks help for the command group', async () => {
    client.setArgv('schedules', '--help');
    await expect(schedules(client)).resolves.toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: 'schedules' },
    ]);
  });

  it('tracks help for get', async () => {
    client.setArgv('schedules', 'get', '--help');
    await expect(schedules(client)).resolves.toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: 'schedules:get' },
    ]);
  });

  it('tracks help for list', async () => {
    client.setArgv('schedules', 'list', '--help');
    await expect(schedules(client)).resolves.toBe(0);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain('--namespace');
    expect(stripAnsi(client.stderr.getFullOutput())).toContain('--limit');
    expect(stripAnsi(client.stderr.getFullOutput())).toContain('--next');
    expect(stripAnsi(client.stderr.getFullOutput())).not.toContain(
      '--execution-id'
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: 'schedules:list' },
    ]);
  });

  it('tracks help for executions list', async () => {
    client.setArgv('schedules', 'executions', 'list', '--help');
    await expect(schedules(client)).resolves.toBe(0);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'schedules executions list'
    );
    expect(stripAnsi(client.stderr.getFullOutput())).toContain('--since');
    expect(stripAnsi(client.stderr.getFullOutput())).toContain('--until');
    expect(stripAnsi(client.stderr.getFullOutput())).not.toContain('--from');
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      '--execution <EXECUTION>'
    );
    expect(stripAnsi(client.stderr.getFullOutput())).not.toContain(
      '--execution-id'
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:executions', value: 'executions' },
      { key: 'flag:help', value: 'schedules:executions:list' },
    ]);
  });

  it('shows create help and tracks it', async () => {
    client.setArgv('schedules', 'create', '--help');
    await expect(schedules(client)).resolves.toBe(0);
    expect(stripAnsi(client.stderr.getFullOutput())).toContain('--cron');
    expect(stripAnsi(client.stderr.getFullOutput())).toContain('--at');
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'YYYY-MM-DDTHH:mm'
    );
    expect(stripAnsi(client.stderr.getFullOutput())).toContain(
      'Evaluate expressions in an IANA timezone'
    );
    expect(stripAnsi(client.stderr.getFullOutput())).toContain('--topic');
    expect(stripAnsi(client.stderr.getFullOutput())).toContain('--payload');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: 'schedules:create' },
    ]);
  });

  it.each([
    'create',
    'delete',
    'update',
    'enable',
    'disable',
    'invoke',
  ])('tracks the %s subcommand', async subcommand => {
    client.setArgv('schedules', subcommand);
    await schedules(client);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: `subcommand:${subcommand}`, value: subcommand },
    ]);
  });
});
