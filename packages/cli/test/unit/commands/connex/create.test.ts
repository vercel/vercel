import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import connex from '../../../../src/commands/connex';
import * as configFilesUtil from '../../../../src/util/config/files';

vi.mock('open', () => ({ default: vi.fn(() => Promise.resolve()) }));

describe('connex create', () => {
  let team: { id: string; slug: string };
  const writeConfigSpy = vi.spyOn(configFilesUtil, 'writeToConfigFile');

  beforeEach(() => {
    client.reset();
    writeConfigSpy.mockClear();
    useUser();
    team = useTeam();
    client.config.currentTeam = team.id;
  });

  it('should error when no type argument is provided', async () => {
    client.setArgv('connex', 'create');

    const exitCode = await connex(client);

    await expect(client.stderr).toOutput('Missing service type');
    expect(exitCode).toBe(1);
  });

  it('should error in non-interactive mode without --name', async () => {
    client.scenario.get('/v1/connex/clients/managed', (_req, res) => {
      res.writeHead(302, {
        Location: 'https://vercel.com/test/~/connex/create?type=slack',
      });
      res.end();
    });

    client.setArgv('connex', 'create', 'slack');
    (client.stdin as any).isTTY = false;

    const exitCode = await connex(client);

    await expect(client.stderr).toOutput('Missing required flag --name');
    expect(exitCode).toBe(1);
  });

  it('should show friendly error when connex feature flag is off (404)', async () => {
    client.scenario.get('/v1/connex/clients/managed', (_req, res) => {
      res.statusCode = 404;
      res.json({ error: { code: 'not_found', message: 'Not Found' } });
    });

    client.setArgv('connex', 'create', 'slack', '--name', 'test-app');

    const exitCode = await connex(client);

    await expect(client.stderr).toOutput('Connex is not enabled');
    expect(exitCode).toBe(1);
  });

  it('should open browser and poll for result on success', async () => {
    let requestUrl = '';
    client.scenario.get('/v1/connex/clients/managed', (req, res) => {
      requestUrl = req.url ?? '';
      res.writeHead(302, {
        Location: 'https://vercel.com/test/~/connex/create?type=slack',
      });
      res.end();
    });

    let pollCount = 0;
    client.scenario.get('/v1/connex/result/:code', (_req, res) => {
      pollCount++;
      if (pollCount < 2) {
        res.json({ status: 'pending' });
      } else {
        res.json({ status: 'success', data: { clientId: 'scl_test123' } });
      }
    });

    client.setArgv('connex', 'create', 'slack', '--name', 'my-bot');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(requestUrl).toContain('service=slack');
    expect(requestUrl).toContain('name=my-bot');
    expect(requestUrl).toContain('request_code=');
    expect(requestUrl).toContain('autoinstall=true');
    expect(pollCount).toBeGreaterThanOrEqual(2);
    await expect(client.stderr).toOutput('scl_test123');
  });

  it('should pass any type to the server without validation', async () => {
    let requestUrl = '';
    client.scenario.get('/v1/connex/clients/managed', (req, res) => {
      requestUrl = req.url ?? '';
      res.writeHead(302, {
        Location: 'https://vercel.com/test/~/connex/create?type=jira',
      });
      res.end();
    });

    client.scenario.get('/v1/connex/result/:code', (_req, res) => {
      res.json({ status: 'success', data: { clientId: 'scl_jira1' } });
    });

    client.setArgv('connex', 'create', 'jira', '--name', 'my-jira');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(requestUrl).toContain('service=jira');
  });

  it('should output JSON when --format=json is used', async () => {
    client.scenario.get('/v1/connex/clients/managed', (_req, res) => {
      res.writeHead(302, {
        Location: 'https://vercel.com/test/~/connex/create?type=slack',
      });
      res.end();
    });

    client.scenario.get('/v1/connex/result/:code', (_req, res) => {
      res.json({ status: 'success', data: { clientId: 'scl_json123' } });
    });

    client.setArgv(
      'connex',
      'create',
      'slack',
      '--name',
      'my-bot',
      '--format=json'
    );

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    await expect(client.stdout).toOutput('"clientId": "scl_json123"');
  });

  it('should keep polling through partial status until success', async () => {
    client.scenario.get('/v1/connex/clients/managed', (_req, res) => {
      res.writeHead(302, {
        Location: 'https://vercel.com/test/~/connex/create?type=slack',
      });
      res.end();
    });

    let pollCount = 0;
    client.scenario.get('/v1/connex/result/:code', (_req, res) => {
      pollCount++;
      if (pollCount === 1) {
        res.json({ status: 'pending' });
      } else if (pollCount === 2) {
        res.json({
          status: 'partial',
          progress: 'installing',
          data: { clientId: 'scl_partial1' },
        });
      } else {
        res.json({
          status: 'success',
          progress: 'installed',
          data: { clientId: 'scl_partial1', installationId: 'T123' },
        });
      }
    });

    client.setArgv('connex', 'create', 'slack', '--name', 'my-bot');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(pollCount).toBe(3);
    await expect(client.stderr).toOutput('scl_partial1');
  });

  it('should handle error status from polling', async () => {
    client.scenario.get('/v1/connex/clients/managed', (_req, res) => {
      res.writeHead(302, {
        Location: 'https://vercel.com/test/~/connex/create?type=slack',
      });
      res.end();
    });

    client.scenario.get('/v1/connex/result/:code', (_req, res) => {
      res.json({
        status: 'error',
        error: { code: 'creation_failed', message: 'Slack API error' },
      });
    });

    client.setArgv('connex', 'create', 'slack', '--name', 'my-bot');

    const exitCode = await connex(client);

    await expect(client.stderr).toOutput('Slack API error');
    expect(exitCode).toBe(1);
  });

  it('should persist team to config after interactive selection', async () => {
    delete client.config.currentTeam;

    client.scenario.get('/v1/connex/clients/managed', (_req, res) => {
      res.writeHead(302, {
        Location: 'https://vercel.com/test/~/connex/create?type=slack',
      });
      res.end();
    });
    client.scenario.get('/v1/connex/result/:code', (_req, res) => {
      res.json({ status: 'success', data: { clientId: 'scl_persist' } });
    });

    client.setArgv('connex', 'create', 'slack', '--name', 'my-bot');
    const exitCodePromise = connex(client);

    await expect(client.stderr).toOutput(
      'Select the team where you want to create this client'
    );
    // Arrow down past the personal account to select the team.
    client.stdin.write('\u001b[B\n');

    expect(await exitCodePromise).toBe(0);
    expect(client.config.currentTeam).toBe(team.id);
    expect(writeConfigSpy).toHaveBeenCalledWith(
      expect.objectContaining({ currentTeam: team.id })
    );
  });

  it('should not rewrite config when team is already set', async () => {
    client.scenario.get('/v1/connex/clients/managed', (_req, res) => {
      res.writeHead(302, {
        Location: 'https://vercel.com/test/~/connex/create?type=slack',
      });
      res.end();
    });
    client.scenario.get('/v1/connex/result/:code', (_req, res) => {
      res.json({ status: 'success', data: { clientId: 'scl_noop' } });
    });

    client.setArgv('connex', 'create', 'slack', '--name', 'my-bot');
    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(writeConfigSpy).not.toHaveBeenCalled();
  });

  it('should tolerate early 404s during polling', async () => {
    client.scenario.get('/v1/connex/clients/managed', (_req, res) => {
      res.writeHead(302, {
        Location: 'https://vercel.com/test/~/connex/create?type=slack',
      });
      res.end();
    });

    let pollCount = 0;
    client.scenario.get('/v1/connex/result/:code', (_req, res) => {
      pollCount++;
      if (pollCount <= 2) {
        res.statusCode = 404;
        res.json({ error: { code: 'not_found', message: 'Not Found' } });
      } else {
        res.json({ status: 'success', data: { clientId: 'scl_after404' } });
      }
    });

    client.setArgv('connex', 'create', 'slack', '--name', 'my-bot');

    const exitCode = await connex(client);

    expect(exitCode).toBe(0);
    expect(pollCount).toBe(3);
    await expect(client.stderr).toOutput('scl_after404');
  });
});
