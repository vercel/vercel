import { describe, beforeEach, expect, it, vi } from 'vitest';
import { join } from 'path';
import { writeFile } from 'node:fs/promises';
import { mkdirp, writeJSON } from 'fs-extra';
import open from 'open';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import connect from '../../../../src/commands/connex';
import * as configFilesUtil from '../../../../src/util/config/files';

// PNG magic header.
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52,
]);

async function writeTmpFile(name: string, bytes: Buffer): Promise<string> {
  const dir = setupTmpDir();
  const path = join(dir, name);
  await writeFile(path, new Uint8Array(bytes));
  return path;
}

vi.mock('open', () => ({ default: vi.fn(() => Promise.resolve()) }));
vi.setConfig({ testTimeout: 15000 });

function fakeConnexClient(overrides: Record<string, unknown> = {}) {
  return {
    id: 'scl_test123',
    ownerId: 'team_abc',
    createdAt: 0,
    updatedAt: 0,
    uid: 'uid_abc',
    type: 'slack',
    name: 'my-bot',
    data: {},
    typeName: 'Slack',
    supportedSubjectTypes: ['user'],
    supportsInstallation: false,
    ...overrides,
  };
}

describe('connex create', () => {
  let team: { id: string; slug: string };
  const writeConfigSpy = vi.spyOn(configFilesUtil, 'writeToConfigFile');

  beforeEach(() => {
    client.reset();
    writeConfigSpy.mockClear();
    (open as unknown as ReturnType<typeof vi.fn>).mockClear();
    useUser();
    team = useTeam();
    client.config.currentTeam = team.id;
  });

  it('should error when no type argument is provided', async () => {
    client.setArgv('connect', 'create');

    const exitCode = await connect(client);

    await expect(client.stderr).toOutput('Missing service type');
    expect(exitCode).toBe(1);
  });

  it('should error in non-interactive mode without --name', async () => {
    client.setArgv('connect', 'create', 'slack');
    (client.stdin as any).isTTY = false;

    const exitCode = await connect(client);

    await expect(client.stderr).toOutput('Missing required flag --name');
    expect(exitCode).toBe(1);
  });

  it('should show friendly error when connect feature flag is off (404)', async () => {
    client.scenario.post('/v1/connect/connectors/managed', (_req, res) => {
      res.statusCode = 404;
      res.json({ error: { code: 'not_found', message: 'Not Found' } });
    });

    client.setArgv('connect', 'create', 'slack', '--name', 'test-app');

    const exitCode = await connect(client);

    await expect(client.stderr).toOutput('Connect is not enabled');
    expect(exitCode).toBe(1);
  });

  it('should create client directly when POST succeeds (no browser)', async () => {
    let postBody: any;
    let pollHit = false;
    client.scenario.post('/v1/connect/connectors/managed', (req, res) => {
      postBody = req.body;
      res.json(fakeConnexClient({ id: 'scl_direct1', uid: 'uid_direct1' }));
    });
    client.scenario.get('/v1/connect/result/:code', (_req, res) => {
      pollHit = true;
      res.json({ status: 'pending' });
    });

    client.setArgv('connect', 'create', 'slack', '--name', 'my-bot');

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(postBody).toMatchObject({
      service: 'slack',
      name: 'my-bot',
      triggers: { enabled: false },
    });
    expect(typeof postBody.request_code).toBe('string');
    expect(pollHit).toBe(false);
    await expect(client.stderr).toOutput('scl_direct1 (UID uid_direct1)');
  });

  it('should pass any type to the server without validation', async () => {
    let postBody: any;
    client.scenario.post('/v1/connect/connectors/managed', (req, res) => {
      postBody = req.body;
      res.json(
        fakeConnexClient({ id: 'scl_jira1', type: 'jira', name: 'my-jira' })
      );
    });

    client.setArgv('connect', 'create', 'jira', '--name', 'my-jira');

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(postBody.service).toBe('jira');
  });

  it('should output JSON when --format=json is used', async () => {
    client.scenario.post('/v1/connect/connectors/managed', (_req, res) => {
      res.json(
        fakeConnexClient({
          id: 'scl_json123',
          uid: 'uid_json123',
          type: 'slack',
          name: 'my-bot',
          supportedSubjectTypes: ['user', 'app'],
        })
      );
    });

    client.setArgv(
      'connect',
      'create',
      'slack',
      '--name',
      'my-bot',
      '--format=json'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    await expect(client.stdout).toOutput('"id": "scl_json123"');
  });

  it('should redact invalid color values in telemetry', async () => {
    client.scenario.post('/v1/connect/connectors/managed', (_req, res) => {
      res.json(fakeConnexClient());
    });

    client.setArgv(
      'connect',
      'create',
      'slack',
      '--name',
      'my-bot',
      '--background-color',
      'not-a-hex',
      '--accent-color',
      '#ff0066'
    );

    await connect(client);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:create', value: 'create' },
      { key: 'option:background-color', value: '[REDACTED]' },
      { key: 'option:accent-color', value: '#ff0066' },
    ]);
  });

  it('should include branding fields in --format=json output', async () => {
    client.scenario.post('/v1/connect/connectors/managed', (_req, res) => {
      res.json(
        fakeConnexClient({
          id: 'scl_json_branded',
          uid: 'uid_json_branded',
          icon: 'sha1abcdef',
          backgroundColor: '#1a2b3c',
          accentColor: '#ff0066',
        })
      );
    });

    client.setArgv(
      'connect',
      'create',
      'slack',
      '--name',
      'my-bot',
      '--format=json'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.icon).toBe('sha1abcdef');
    expect(parsed.backgroundColor).toBe('#1a2b3c');
    expect(parsed.accentColor).toBe('#ff0066');
  });

  it('should emit null branding fields in --format=json when API omits them', async () => {
    client.scenario.post('/v1/connect/connectors/managed', (_req, res) => {
      res.json(
        fakeConnexClient({
          id: 'scl_json_no_brand',
          uid: 'uid_json_no_brand',
        })
      );
    });

    client.setArgv(
      'connect',
      'create',
      'slack',
      '--name',
      'my-bot',
      '--format=json'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    const stdout = client.stdout.getFullOutput();
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.icon).toBeNull();
    expect(parsed.backgroundColor).toBeNull();
    expect(parsed.accentColor).toBeNull();
  });

  it('should open browser and poll when POST returns 422 with registerUrl', async () => {
    let postHits = 0;
    client.scenario.post('/v1/connect/connectors/managed', (_req, res) => {
      postHits++;
      res.statusCode = 422;
      res.json({
        error: {
          code: 'registration_required',
          message: 'Registration required',
          registerUrl: 'https://vercel.com/test/~/connex/register?type=slack',
        },
      });
    });

    let pollCount = 0;
    client.scenario.get('/v1/connect/result/:code', (_req, res) => {
      pollCount++;
      if (pollCount < 2) {
        res.json({ status: 'pending' });
      } else {
        res.json({ status: 'success', data: { clientId: 'scl_after422' } });
      }
    });

    client.scenario.get('/v1/connect/connectors/:id', (req, res) => {
      res.json(
        fakeConnexClient({
          id: (req.params as any).id,
          uid: 'uid_after422',
        })
      );
    });

    client.setArgv('connect', 'create', 'slack', '--name', 'my-bot');

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(postHits).toBe(1);
    expect(pollCount).toBeGreaterThanOrEqual(2);
    await expect(client.stderr).toOutput('scl_after422 (UID uid_after422)');
  });

  it('should keep polling through partial status until success', async () => {
    client.scenario.post('/v1/connect/connectors/managed', (_req, res) => {
      res.statusCode = 422;
      res.json({
        error: {
          message: 'Registration required',
          registerUrl: 'https://vercel.com/test/~/connex/register',
        },
      });
    });

    let pollCount = 0;
    client.scenario.get('/v1/connect/result/:code', (_req, res) => {
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

    client.scenario.get('/v1/connect/connectors/:id', (req, res) => {
      res.json(
        fakeConnexClient({
          id: (req.params as any).id,
          uid: 'uid_partial1',
          supportsInstallation: true,
        })
      );
    });

    client.setArgv('connect', 'create', 'slack', '--name', 'my-bot');

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(pollCount).toBe(3);
    await expect(client.stderr).toOutput(
      'created and installed: scl_partial1 (UID uid_partial1)'
    );
  });

  it('should handle error status from polling after 422', async () => {
    client.scenario.post('/v1/connect/connectors/managed', (_req, res) => {
      res.statusCode = 422;
      res.json({
        error: {
          message: 'Registration required',
          registerUrl: 'https://vercel.com/test/~/connex/register',
        },
      });
    });

    client.scenario.get('/v1/connect/result/:code', (_req, res) => {
      res.json({
        status: 'error',
        error: { code: 'creation_failed', message: 'Slack API error' },
      });
    });

    client.setArgv('connect', 'create', 'slack', '--name', 'my-bot');

    const exitCode = await connect(client);

    await expect(client.stderr).toOutput('Slack API error');
    expect(exitCode).toBe(1);
  });

  it('should persist team to config after interactive selection', async () => {
    delete client.config.currentTeam;

    client.scenario.post('/v1/connect/connectors/managed', (_req, res) => {
      res.json(fakeConnexClient({ id: 'scl_persist', uid: 'uid_persist' }));
    });

    client.setArgv('connect', 'create', 'slack', '--name', 'my-bot');
    const exitCodePromise = connect(client);

    await expect(client.stderr).toOutput(
      'Select the team where you want to create this connector'
    );
    // Arrow down past the personal account to select the team.
    client.stdin.write('[B\n');

    expect(await exitCodePromise).toBe(0);
    expect(client.config.currentTeam).toBe(team.id);
    expect(writeConfigSpy).toHaveBeenCalledWith(
      expect.objectContaining({ currentTeam: team.id })
    );
  });

  it('should use team from .vercel/project.json without prompting', async () => {
    client.reset();
    useUser();
    team = useTeam('team_linked');
    delete client.config.currentTeam;

    const cwd = setupTmpDir();
    await mkdirp(join(cwd, '.vercel'));
    await writeJSON(join(cwd, '.vercel', 'project.json'), {
      orgId: team.id,
      projectId: 'proj_from_link',
    });
    client.cwd = cwd;

    client.scenario.post('/v1/connect/connectors/managed', (_req, res) => {
      res.json(fakeConnexClient({ id: 'scl_linked', uid: 'uid_linked' }));
    });

    client.setArgv('connect', 'create', 'slack', '--name', 'my-bot');
    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(client.config.currentTeam).toBe(team.id);
    // No prompt means no persist path executed.
    expect(writeConfigSpy).not.toHaveBeenCalled();
  });

  it('should error when user selects personal account instead of a team', async () => {
    delete client.config.currentTeam;

    client.setArgv('connect', 'create', 'slack', '--name', 'my-bot');
    const exitCodePromise = connect(client);

    await expect(client.stderr).toOutput(
      'Select the team where you want to create this connector'
    );
    // Accept the default (personal account for non-northstar users).
    client.stdin.write('\n');

    expect(await exitCodePromise).toBe(1);
    await expect(client.stderr).toOutput('Connect requires a team');
    expect(writeConfigSpy).not.toHaveBeenCalled();
  });

  it('should not rewrite config when team is already set', async () => {
    client.scenario.post('/v1/connect/connectors/managed', (_req, res) => {
      res.json(fakeConnexClient({ id: 'scl_noop', uid: 'uid_noop' }));
    });

    client.setArgv('connect', 'create', 'slack', '--name', 'my-bot');
    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(writeConfigSpy).not.toHaveBeenCalled();
  });

  describe('--triggers flag', () => {
    it('should send triggers: { enabled: true } when --triggers is passed', async () => {
      let postBody: any;
      client.scenario.post('/v1/connect/connectors/managed', (req, res) => {
        postBody = req.body;
        res.json(
          fakeConnexClient({ id: 'scl_triggers1', uid: 'uid_triggers1' })
        );
      });

      client.setArgv(
        'connect',
        'create',
        'slack',
        '--name',
        'my-bot',
        '--triggers'
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(postBody).toMatchObject({
        service: 'slack',
        name: 'my-bot',
        triggers: { enabled: true },
      });
    });

    it('should send triggers: { enabled: false } when --triggers is not passed', async () => {
      let postBody: any;
      client.scenario.post('/v1/connect/connectors/managed', (req, res) => {
        postBody = req.body;
        res.json(fakeConnexClient({ id: 'scl_notrig', uid: 'uid_notrig' }));
      });

      client.setArgv('connect', 'create', 'slack', '--name', 'my-bot');

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(postBody.triggers).toEqual({ enabled: false });
    });
  });

  describe('branding flags', () => {
    it('should upload icon and send branding in direct-path POST body', async () => {
      let uploadHeaders: Record<string, unknown> | undefined;
      let uploadHit = false;
      let postBody: any;
      let patchHit = false;

      client.scenario.post('/v2/files', (req, res) => {
        uploadHeaders = req.headers;
        uploadHit = true;
        res.json({});
      });
      client.scenario.post('/v1/connect/connectors/managed', (req, res) => {
        postBody = req.body;
        res.json(fakeConnexClient({ id: 'scl_branded', uid: 'uid_branded' }));
      });
      client.scenario.patch('/v1/connect/connectors/:id', (_req, res) => {
        patchHit = true;
        res.json(fakeConnexClient());
      });

      const iconPath = await writeTmpFile('logo.png', PNG_BYTES);

      client.setArgv(
        'connect',
        'create',
        'slack',
        '--name',
        'my-bot',
        '--icon',
        iconPath,
        '--background-color',
        '#1A2B3C',
        '--accent-color',
        '#ff0066'
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(uploadHit).toBe(true);
      expect(patchHit).toBe(false);
      expect(postBody).toMatchObject({
        service: 'slack',
        name: 'my-bot',
        backgroundColor: '#1A2B3C',
        accentColor: '#ff0066',
      });
      expect(typeof postBody.icon).toBe('string');
      expect(postBody.icon.length).toBe(40);

      // The body for /v2/files is binary (Buffer); express.json() does not
      // parse it. Assert via request headers.
      expect(uploadHeaders?.['content-type']).toBe('application/octet-stream');
      expect(uploadHeaders?.['x-now-digest']).toBe(postBody.icon);
      expect(uploadHeaders?.['x-now-size']).toBe(String(PNG_BYTES.length));
    });

    it('should send colors only when --icon is not provided', async () => {
      let uploadHit = false;
      let postBody: any;
      client.scenario.post('/v2/files', (_req, res) => {
        uploadHit = true;
        res.json({});
      });
      client.scenario.post('/v1/connect/connectors/managed', (req, res) => {
        postBody = req.body;
        res.json(fakeConnexClient({ id: 'scl_colors', uid: 'uid_colors' }));
      });

      client.setArgv(
        'connect',
        'create',
        'slack',
        '--name',
        'my-bot',
        '--background-color',
        '#000000',
        '--accent-color',
        '#ffffff'
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(uploadHit).toBe(false);
      expect(postBody.icon).toBeUndefined();
      expect(postBody).toMatchObject({
        backgroundColor: '#000000',
        accentColor: '#ffffff',
      });
    });

    it('should follow up with PATCH when browser flow runs', async () => {
      let postBody: any;
      let patchBody: any;
      let patchedId: string | undefined;
      let uploadHit = false;

      client.scenario.post('/v2/files', (_req, res) => {
        uploadHit = true;
        res.json({});
      });
      client.scenario.post('/v1/connect/connectors/managed', (req, res) => {
        postBody = req.body;
        res.statusCode = 422;
        res.json({
          error: {
            code: 'registration_required',
            message: 'Registration required',
            registerUrl: 'https://vercel.com/test/~/connex/register?type=slack',
          },
        });
      });
      let pollCount = 0;
      client.scenario.get('/v1/connect/result/:code', (_req, res) => {
        pollCount++;
        if (pollCount < 2) {
          res.json({ status: 'pending' });
        } else {
          res.json({
            status: 'success',
            data: { clientId: 'scl_browser_branded' },
          });
        }
      });
      client.scenario.get('/v1/connect/connectors/:id', (req, res) => {
        res.json(
          fakeConnexClient({
            id: (req.params as any).id,
            uid: 'uid_browser_branded',
          })
        );
      });
      client.scenario.patch('/v1/connect/connectors/:id', (req, res) => {
        patchBody = req.body;
        patchedId = (req.params as { id: string }).id;
        res.json(
          fakeConnexClient({
            id: 'scl_browser_branded',
            uid: 'uid_browser_branded',
            icon: req.body.icon,
            backgroundColor: req.body.backgroundColor,
            accentColor: req.body.accentColor,
          })
        );
      });

      const iconPath = await writeTmpFile('logo.png', PNG_BYTES);

      client.setArgv(
        'connect',
        'create',
        'slack',
        '--name',
        'my-bot',
        '--icon',
        iconPath,
        '--background-color',
        '#aabbcc',
        '--accent-color',
        '#112233'
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);
      expect(uploadHit).toBe(true);
      // The initial POST body also carries branding (best-effort) but the
      // dashboard ignores it on the browser flow. The follow-up PATCH is what
      // applies branding for real.
      expect(typeof postBody.icon).toBe('string');
      expect(patchedId).toBe('scl_browser_branded');
      expect(patchBody).toMatchObject({
        backgroundColor: '#aabbcc',
        accentColor: '#112233',
      });
      expect(typeof patchBody.icon).toBe('string');
      expect(patchBody.icon.length).toBe(40);

      await expect(client.stderr).toOutput('scl_browser_branded');
    });

    it('should append branding query params to registerUrl when 422 triggers browser flow', async () => {
      client.scenario.post('/v2/files', (_req, res) => {
        res.json({});
      });
      client.scenario.post('/v1/connect/connectors/managed', (_req, res) => {
        res.statusCode = 422;
        res.json({
          error: {
            code: 'registration_required',
            message: 'Registration required',
            // registerUrl already carries query params — confirm we preserve them.
            registerUrl:
              'https://vercel.com/api/v1/connex/clients/managed?teamId=team_abc&service=slack&name=my-bot&uid=uid_abc&request_code=rc_123&projectId=proj_1',
          },
        });
      });
      client.scenario.get('/v1/connect/result/:code', (_req, res) => {
        res.json({
          status: 'success',
          data: { clientId: 'scl_branded_url' },
        });
      });
      client.scenario.get('/v1/connect/connectors/:id', (req, res) => {
        res.json(
          fakeConnexClient({
            id: (req.params as any).id,
            uid: 'uid_branded_url',
          })
        );
      });
      client.scenario.patch('/v1/connect/connectors/:id', (req, res) => {
        res.json(
          fakeConnexClient({
            id: 'scl_branded_url',
            uid: 'uid_branded_url',
            icon: req.body.icon,
            backgroundColor: req.body.backgroundColor,
            accentColor: req.body.accentColor,
          })
        );
      });

      const iconPath = await writeTmpFile('logo.png', PNG_BYTES);

      client.setArgv(
        'connect',
        'create',
        'slack',
        '--name',
        'my-bot',
        '--icon',
        iconPath,
        '--background-color',
        '#aabbcc',
        '--accent-color',
        '#112233'
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(0);

      const openMock = open as unknown as ReturnType<typeof vi.fn>;
      expect(openMock).toHaveBeenCalledTimes(1);
      const openedArg = openMock.mock.calls[0][0] as string;
      const opened = new URL(openedArg);

      // Branding params appended.
      const iconParam = opened.searchParams.get('icon');
      expect(typeof iconParam).toBe('string');
      expect(iconParam).toHaveLength(40); // SHA-1 hex, not the file path.
      expect(iconParam).not.toContain('/');
      expect(opened.searchParams.get('backgroundColor')).toBe('#aabbcc');
      expect(opened.searchParams.get('accentColor')).toBe('#112233');

      // Pre-existing params preserved.
      expect(opened.searchParams.get('teamId')).toBe('team_abc');
      expect(opened.searchParams.get('service')).toBe('slack');
      expect(opened.searchParams.get('name')).toBe('my-bot');
      expect(opened.searchParams.get('request_code')).toBe('rc_123');

      // Origin + path preserved.
      expect(opened.origin).toBe('https://vercel.com');
      expect(opened.pathname).toBe('/api/v1/connex/clients/managed');
    });

    it('should warn and exit non-zero when browser-flow branding PATCH fails', async () => {
      let patchHit = false;
      client.scenario.post('/v2/files', (_req, res) => {
        res.json({});
      });
      client.scenario.post('/v1/connect/connectors/managed', (_req, res) => {
        res.statusCode = 422;
        res.json({
          error: {
            code: 'registration_required',
            message: 'Registration required',
            registerUrl: 'https://vercel.com/test/~/connex/register?type=slack',
          },
        });
      });
      let pollCount = 0;
      client.scenario.get('/v1/connect/result/:code', (_req, res) => {
        pollCount++;
        if (pollCount < 2) {
          res.json({ status: 'pending' });
        } else {
          res.json({
            status: 'success',
            data: { clientId: 'scl_browser_patch_fail' },
          });
        }
      });
      client.scenario.get('/v1/connect/connectors/:id', (req, res) => {
        res.json(
          fakeConnexClient({
            id: (req.params as any).id,
            uid: 'uid_browser_patch_fail',
          })
        );
      });
      client.scenario.patch('/v1/connect/connectors/:id', (_req, res) => {
        patchHit = true;
        res.statusCode = 500;
        res.json({ error: { code: 'internal', message: 'patch boom' } });
      });

      const iconPath = await writeTmpFile('logo.png', PNG_BYTES);

      client.setArgv(
        'connect',
        'create',
        'slack',
        '--name',
        'my-bot',
        '--icon',
        iconPath,
        '--background-color',
        '#aabbcc',
        '--accent-color',
        '#112233'
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(1);
      expect(patchHit).toBe(true);
      await expect(client.stderr).toOutput('Failed to apply branding');
      await expect(client.stderr).toOutput('scl_browser_patch_fail');
    });

    it('should reject invalid hex before any network call', async () => {
      let uploadHit = false;
      let postHit = false;
      client.scenario.post('/v2/files', (_req, res) => {
        uploadHit = true;
        res.json({});
      });
      client.scenario.post('/v1/connect/connectors/managed', (_req, res) => {
        postHit = true;
        res.json(fakeConnexClient());
      });

      client.setArgv(
        'connect',
        'create',
        'slack',
        '--name',
        'my-bot',
        '--background-color',
        '#abc'
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(1);
      expect(uploadHit).toBe(false);
      expect(postHit).toBe(false);
      await expect(client.stderr).toOutput(
        'Invalid background color "#abc". Expected 6-digit hex'
      );
    });

    it('should error on non-existent icon path before any network call', async () => {
      let uploadHit = false;
      let postHit = false;
      client.scenario.post('/v2/files', (_req, res) => {
        uploadHit = true;
        res.json({});
      });
      client.scenario.post('/v1/connect/connectors/managed', (_req, res) => {
        postHit = true;
        res.json(fakeConnexClient());
      });

      client.setArgv(
        'connect',
        'create',
        'slack',
        '--name',
        'my-bot',
        '--icon',
        '/tmp/this-file-does-not-exist.png'
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(1);
      expect(uploadHit).toBe(false);
      expect(postHit).toBe(false);
      await expect(client.stderr).toOutput('Could not read icon file at');
    });

    it('should reject non-image file (magic-byte check)', async () => {
      let uploadHit = false;
      let postHit = false;
      client.scenario.post('/v2/files', (_req, res) => {
        uploadHit = true;
        res.json({});
      });
      client.scenario.post('/v1/connect/connectors/managed', (_req, res) => {
        postHit = true;
        res.json(fakeConnexClient());
      });

      const notImage = await writeTmpFile(
        'notes.txt',
        Buffer.from('not an image\n')
      );

      client.setArgv(
        'connect',
        'create',
        'slack',
        '--name',
        'my-bot',
        '--icon',
        notImage
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(1);
      expect(uploadHit).toBe(false);
      expect(postHit).toBe(false);
      await expect(client.stderr).toOutput('is not a PNG or JPEG');
    });

    it('should run icon preflight before team selection (no team prompt)', async () => {
      // Unset currentTeam so a team-selection prompt would fire if the icon
      // preflight ran AFTER selectConnexTeam (the bug we are guarding
      // against — the plan requires path + magic bytes BEFORE team selection).
      delete client.config.currentTeam;

      const notImage = await writeTmpFile(
        'fake.png',
        Buffer.from('not an image\n')
      );

      client.setArgv(
        'connect',
        'create',
        'slack',
        '--name',
        'my-bot',
        '--icon',
        notImage
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('is not a PNG or JPEG');
    });

    it('should surface server upload error and not create connector', async () => {
      let postHit = false;
      client.scenario.post('/v2/files', (_req, res) => {
        res.statusCode = 413;
        res.json({
          error: { code: 'payload_too_large', message: 'File is too large' },
        });
      });
      client.scenario.post('/v1/connect/connectors/managed', (_req, res) => {
        postHit = true;
        res.json(fakeConnexClient());
      });

      const iconPath = await writeTmpFile('logo.png', PNG_BYTES);

      client.setArgv(
        'connect',
        'create',
        'slack',
        '--name',
        'my-bot',
        '--icon',
        iconPath
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(1);
      expect(postHit).toBe(false);
      await expect(client.stderr).toOutput(
        'Failed to upload icon: File is too large'
      );
    });

    it('should reject a truncated PNG before any network call', async () => {
      let uploadHit = false;
      client.scenario.post('/v2/files', (_req, res) => {
        uploadHit = true;
        res.json({});
      });

      // 4-byte PNG prefix only — passes the old check, fails the >=12 check.
      const TRUNCATED = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const iconPath = await writeTmpFile('logo.png', TRUNCATED);

      client.setArgv(
        'connect',
        'create',
        'slack',
        '--name',
        'my-bot',
        '--icon',
        iconPath
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(1);
      expect(uploadHit).toBe(false);
      await expect(client.stderr).toOutput('is not a PNG or JPEG');
    });

    it('should reject icons larger than 5 MB before any network call', async () => {
      let uploadHit = false;
      client.scenario.post('/v2/files', (_req, res) => {
        uploadHit = true;
        res.json({});
      });

      // Real PNG signature followed by enough padding to exceed 5 MB.
      const OVERSIZED = Buffer.alloc(5 * 1024 * 1024 + 13);
      OVERSIZED.set(
        [
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
          0x0d,
        ],
        0
      );
      const iconPath = await writeTmpFile('big.png', OVERSIZED);

      client.setArgv(
        'connect',
        'create',
        'slack',
        '--name',
        'my-bot',
        '--icon',
        iconPath
      );

      const exitCode = await connect(client);

      expect(exitCode).toBe(1);
      expect(uploadHit).toBe(false);
      await expect(client.stderr).toOutput('maximum is');
    });
  });

  it('should tolerate early 404s during polling after 422', async () => {
    client.scenario.post('/v1/connect/connectors/managed', (_req, res) => {
      res.statusCode = 422;
      res.json({
        error: {
          message: 'Registration required',
          registerUrl: 'https://vercel.com/test/~/connex/register',
        },
      });
    });

    let pollCount = 0;
    client.scenario.get('/v1/connect/result/:code', (_req, res) => {
      pollCount++;
      if (pollCount <= 2) {
        res.statusCode = 404;
        res.json({ error: { code: 'not_found', message: 'Not Found' } });
      } else {
        res.json({ status: 'success', data: { clientId: 'scl_after404' } });
      }
    });

    client.scenario.get('/v1/connect/connectors/:id', (req, res) => {
      res.json(
        fakeConnexClient({
          id: (req.params as any).id,
          uid: 'uid_after404',
        })
      );
    });

    client.setArgv('connect', 'create', 'slack', '--name', 'my-bot');

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(pollCount).toBe(3);
    await expect(client.stderr).toOutput('scl_after404');
  });
});
