import { describe, beforeEach, expect, it, vi } from 'vitest';
import { join } from 'path';
import { writeFile } from 'node:fs/promises';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import connect from '../../../../src/commands/connex';

vi.setConfig({ testTimeout: 15000 });

// PNG magic header: 89 50 4E 47 + a tiny IHDR chunk + trailer.
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52,
]);
// JPEG magic header.
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a]);

async function writeTmpFile(name: string, bytes: Buffer): Promise<string> {
  const dir = setupTmpDir();
  const path = join(dir, name);
  await writeFile(path, new Uint8Array(bytes));
  return path;
}

function fakeConnexClient(overrides: Record<string, unknown> = {}) {
  return {
    id: 'scl_test123',
    ownerId: 'team_abc',
    createdAt: 0,
    updatedAt: 0,
    uid: 'slack/my-bot',
    type: 'slack',
    name: 'my-bot',
    data: {},
    typeName: 'Slack',
    supportedSubjectTypes: ['user'],
    supportsInstallation: false,
    ...overrides,
  };
}

describe('connex update', () => {
  let team: { id: string; slug: string };

  beforeEach(() => {
    client.reset();
    useUser();
    team = useTeam();
    client.config.currentTeam = team.id;
  });

  it('should error when no id argument is provided', async () => {
    client.setArgv('connect', 'update');

    const exitCode = await connect(client);

    await expect(client.stderr).toOutput('Missing connector ID');
    expect(exitCode).toBe(1);
  });

  it('should error when no flags are provided', async () => {
    client.setArgv('connect', 'update', 'scl_abc');

    const exitCode = await connect(client);

    await expect(client.stderr).toOutput(
      'Specify at least one of: --icon, --background-color, --accent-color'
    );
    expect(exitCode).toBe(1);
  });

  it('should error on invalid hex color before any network call', async () => {
    let patchHit = false;
    client.scenario.patch('/v1/connect/connectors/:id', (_req, res) => {
      patchHit = true;
      res.json(fakeConnexClient());
    });

    client.setArgv('connect', 'update', 'scl_abc', '--background-color', 'red');

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(patchHit).toBe(false);
    await expect(client.stderr).toOutput(
      'Invalid background color "red". Expected 6-digit hex'
    );
  });

  it('should error on empty --icon path', async () => {
    client.setArgv('connect', 'update', 'scl_abc', '--icon', '');

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('Icon path cannot be empty');
  });

  it('should error on non-existent icon path before any network call', async () => {
    let uploadHit = false;
    let patchHit = false;
    client.scenario.post('/v2/files', (_req, res) => {
      uploadHit = true;
      res.json({});
    });
    client.scenario.patch('/v1/connect/connectors/:id', (_req, res) => {
      patchHit = true;
      res.json(fakeConnexClient());
    });

    client.setArgv(
      'connect',
      'update',
      'scl_abc',
      '--icon',
      '/tmp/this-file-does-not-exist.png'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(uploadHit).toBe(false);
    expect(patchHit).toBe(false);
    await expect(client.stderr).toOutput('Could not read icon file at');
  });

  it('should run icon preflight before team selection (no team prompt)', async () => {
    // Unset currentTeam so a team selection prompt would fire if the icon
    // preflight ran AFTER selectConnexTeam (which is the bug we are guarding
    // against — the plan requires path + magic bytes BEFORE team selection).
    delete client.config.currentTeam;

    const notImage = await writeTmpFile(
      'fake.png',
      Buffer.from('not an image\n')
    );

    client.setArgv('connect', 'update', 'scl_abc', '--icon', notImage);

    const exitCode = await connect(client);

    // We expect the magic-byte error, NOT a 'Select team' prompt.
    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('is not a PNG or JPEG');
  });

  it('should error on non-image file (magic-byte check)', async () => {
    let uploadHit = false;
    let patchHit = false;
    client.scenario.post('/v2/files', (_req, res) => {
      uploadHit = true;
      res.json({});
    });
    client.scenario.patch('/v1/connect/connectors/:id', (_req, res) => {
      patchHit = true;
      res.json(fakeConnexClient());
    });

    const notImage = await writeTmpFile(
      'readme.md',
      Buffer.from('# hello world\n')
    );

    client.setArgv('connect', 'update', 'scl_abc', '--icon', notImage);

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(uploadHit).toBe(false);
    expect(patchHit).toBe(false);
    await expect(client.stderr).toOutput('is not a PNG or JPEG');
  });

  it('should PATCH with icon SHA and colors after upload', async () => {
    let uploadHeaders: Record<string, unknown> | undefined;
    let patchBody: Record<string, unknown> | undefined;
    let patchedId: string | undefined;

    client.scenario.post('/v2/files', (req, res) => {
      uploadHeaders = req.headers;
      res.json({});
    });
    client.scenario.patch('/v1/connect/connectors/:id', (req, res) => {
      patchBody = req.body;
      patchedId = (req.params as { id: string }).id;
      res.json(
        fakeConnexClient({
          id: 'scl_branded',
          uid: 'slack/branded',
          icon: req.body.icon,
          backgroundColor: req.body.backgroundColor,
          accentColor: req.body.accentColor,
        })
      );
    });

    const iconPath = await writeTmpFile('logo.png', PNG_BYTES);

    client.setArgv(
      'connect',
      'update',
      'scl_branded',
      '--icon',
      iconPath,
      '--background-color',
      '#1A2B3C',
      '--accent-color',
      '#ff0066'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(patchedId).toBe('scl_branded');
    expect(patchBody).toMatchObject({
      backgroundColor: '#1A2B3C',
      accentColor: '#ff0066',
    });
    expect(typeof patchBody?.icon).toBe('string');
    expect((patchBody?.icon as string).length).toBe(40); // sha1 hex length

    // The body for /v2/files is binary (Buffer), so express.json() does not
    // parse it. Assert via headers + content-type instead.
    expect(uploadHeaders?.['content-type']).toBe('application/octet-stream');
    expect(uploadHeaders?.['x-now-digest']).toBe(patchBody?.icon);
    expect(uploadHeaders?.['x-now-size']).toBe(String(PNG_BYTES.length));

    await expect(client.stderr).toOutput('Connector slack/branded updated');
  });

  it('should accept JPEG icon', async () => {
    let patchBody: Record<string, unknown> | undefined;
    client.scenario.post('/v2/files', (_req, res) => {
      res.json({});
    });
    client.scenario.patch('/v1/connect/connectors/:id', (req, res) => {
      patchBody = req.body;
      res.json(fakeConnexClient({ id: 'scl_jpeg', uid: 'slack/jpeg' }));
    });

    const iconPath = await writeTmpFile('logo.jpg', JPEG_BYTES);

    client.setArgv('connect', 'update', 'scl_jpeg', '--icon', iconPath);

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(typeof patchBody?.icon).toBe('string');
  });

  it('should update colors only without invoking /v2/files', async () => {
    let uploadHit = false;
    let patchBody: Record<string, unknown> | undefined;
    client.scenario.post('/v2/files', (_req, res) => {
      uploadHit = true;
      res.json({});
    });
    client.scenario.patch('/v1/connect/connectors/:id', (req, res) => {
      patchBody = req.body;
      res.json(fakeConnexClient({ id: 'scl_color', uid: 'slack/color' }));
    });

    client.setArgv(
      'connect',
      'update',
      'scl_color',
      '--background-color',
      '#000000',
      '--accent-color',
      '#ffffff'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(uploadHit).toBe(false);
    expect(patchBody).toEqual({
      backgroundColor: '#000000',
      accentColor: '#ffffff',
    });
  });

  it('should surface a friendly error for a 404 PATCH', async () => {
    client.scenario.patch('/v1/connect/connectors/:id', (_req, res) => {
      res.statusCode = 404;
      res.json({ error: { code: 'not_found', message: 'Not Found' } });
    });

    client.setArgv(
      'connect',
      'update',
      'scl_missing',
      '--background-color',
      '#000000'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    await expect(client.stderr).toOutput('Connector not found: scl_missing');
  });

  it('should surface upload server error and skip PATCH', async () => {
    let patchHit = false;
    client.scenario.post('/v2/files', (_req, res) => {
      res.statusCode = 400;
      res.json({
        error: { code: 'bad_request', message: 'Image is too large' },
      });
    });
    client.scenario.patch('/v1/connect/connectors/:id', (_req, res) => {
      patchHit = true;
      res.json(fakeConnexClient());
    });

    const iconPath = await writeTmpFile('logo.png', PNG_BYTES);

    client.setArgv('connect', 'update', 'scl_abc', '--icon', iconPath);

    const exitCode = await connect(client);

    expect(exitCode).toBe(1);
    expect(patchHit).toBe(false);
    await expect(client.stderr).toOutput(
      'Failed to upload icon: Image is too large'
    );
  });

  it('should output JSON when --format=json is used', async () => {
    client.scenario.patch('/v1/connect/connectors/:id', (_req, res) => {
      res.json(
        fakeConnexClient({
          id: 'scl_json',
          uid: 'slack/json',
          backgroundColor: '#123456',
          accentColor: '#abcdef',
        })
      );
    });

    client.setArgv(
      'connect',
      'update',
      'scl_json',
      '--background-color',
      '#123456',
      '--format=json'
    );

    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    await expect(client.stdout).toOutput('"id": "scl_json"');
  });
});
