import { beforeEach, describe, expect, it } from 'vitest';
import storage from '../../../../src/commands/storage';
import { client } from '../../../mocks/client';

describe('storage', () => {
  beforeEach(() => {
    client.reset();
  });

  it('prints help and tracks telemetry', async () => {
    client.setArgv('storage', '--help');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: 'storage' },
    ]);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('vercel storage connect');
    expect(stderr).toContain('disconnect');
    expect(stderr).toContain('list');
    expect(stderr).toContain('create');
    expect(stderr).toContain('delete');
  });

  it('prints create help with every provider flag', async () => {
    client.setArgv('storage', 'create', '--help');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: 'storage:create' },
    ]);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('--type');
    expect(stderr).toContain('--access');
    expect(stderr).toContain('--region');
    expect(stderr).toContain('--items');
  });

  it('prints subcommand help and tracks telemetry', async () => {
    client.setArgv('storage', 'connect', '--help');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: 'storage:connect' },
    ]);
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('--auth');
    expect(stderr).toContain('--add-rw-token');
    expect(stderr).toContain('--dry-run');
  });

  it('prints help when no subcommand is given', async () => {
    client.setArgv('storage');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(2);
    expect(client.stderr.getFullOutput()).toContain('vercel storage');
  });

  it('rejects an unknown subcommand', async () => {
    client.setArgv('storage', 'frobnicate');
    const exitCode = await storage(client);

    expect(exitCode).toEqual(2);
    await expect(client.stderr).toOutput('Please specify a valid subcommand');
  });

  it('tracks the invoked subcommand', async () => {
    client.setArgv('storage', 'status', '--json');
    await storage(client);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:status', value: 'status' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });
});
