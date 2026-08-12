import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import drains from '../../../../src/commands/drains';
import { useUser } from '../../../mocks/user';
import { defaultDrain } from '../../../mocks/drains';

describe('drains pause / resume', () => {
  beforeEach(() => {
    useUser();
  });

  it('pauses a drain', async () => {
    let patched: { status?: string } = {};
    client.scenario.get('/v1/drains/drn_1', (_req, res) =>
      res.json(defaultDrain)
    );
    client.scenario.patch('/v1/drains/drn_1', (req, res) => {
      patched = req.body;
      res.json({ ...defaultDrain, status: 'disabled' });
    });

    client.setArgv('drains', 'pause', 'drn_1');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);
    expect(patched.status).toEqual('disabled');
    await expect(client.stderr).toOutput('paused');
  });

  it('resumes a drain', async () => {
    let patched: { status?: string } = {};
    client.scenario.patch('/v1/drains/drn_1', (req, res) => {
      patched = req.body;
      res.json({ ...defaultDrain, status: 'enabled' });
    });

    client.setArgv('drains', 'resume', 'drn_1');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);
    expect(patched.status).toEqual('enabled');
    await expect(client.stderr).toOutput('resumed');
  });

  it('reports the new status as JSON', async () => {
    client.scenario.patch('/v1/drains/drn_1', (_req, res) =>
      res.json({ ...defaultDrain, status: 'disabled' })
    );
    client.setArgv('drains', 'pause', 'drn_1', '--json');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);

    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed).toEqual({ id: 'drn_1', status: 'disabled' });
  });

  it('reports the new status with --format json', async () => {
    client.scenario.patch('/v1/drains/drn_1', (_req, res) =>
      res.json({ ...defaultDrain, status: 'enabled' })
    );
    client.setArgv('drains', 'resume', 'drn_1', '--format', 'json');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(0);

    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed).toEqual({ id: 'drn_1', status: 'enabled' });
  });

  it('rejects an invalid --format value', async () => {
    client.setArgv('drains', 'pause', 'drn_1', '--format', 'yaml');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Invalid output format');
  });

  it('cannot resume a drain that Vercel disabled', async () => {
    client.scenario.patch('/v1/drains/drn_1', (_req, res) => {
      res.status(400).json({
        error: {
          code: 'drain_enable_not_allowed',
          message: 'disabled by vercel',
        },
      });
    });
    client.setArgv('drains', 'resume', 'drn_1');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput("can't be resumed");
  });

  it('errors when no id is passed', async () => {
    client.setArgv('drains', 'pause');
    const exitCode = await drains(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput('Please provide a drain id');
  });
});
