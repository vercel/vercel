import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import vcr from '../../../../src/commands/vcr';
import * as linkModule from '../../../../src/util/projects/link';
import * as getScopeModule from '../../../../src/util/get-scope';

vi.mock('../../../../src/util/projects/link');
vi.mock('../../../../src/util/get-scope');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedGetScope = vi.mocked(getScopeModule.default);

let tmpDir: string;

function mockLinkedProject() {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'linked',
    project: {
      id: 'prj_vcr',
      name: 'vcr-project',
      accountId: 'team_dummy',
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
    org: {
      id: 'team_dummy',
      slug: 'my-team',
      type: 'team',
    },
  } as any);
}

function mockTeamScope() {
  mockedGetScope.mockResolvedValue({
    contextName: 'my-team',
    team: { id: 'team_dummy', slug: 'my-team' } as any,
    user: { id: 'user_dummy' } as any,
  } as any);
}

describe('vcr image', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    mockLinkedProject();
    mockTeamScope();
    tmpDir = setupTmpDir('vercel-vcr-image');
    client.cwd = tmpDir;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('errors with a generic message when no subcommand is given', async () => {
    client.setArgv('vcr', 'image');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    const out = client.stderr.getFullOutput();
    expect(out).not.toContain('undefined');
    expect(out).toContain('Please specify a valid subcommand');
  });

  it('errors on an unknown subcommand', async () => {
    client.setArgv('vcr', 'image', 'bogus');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Unknown "vcr image"');
  });

  it('tracks which alias of "image" was used', async () => {
    client.scenario.get('/v1/vcr/repository/my-app/images', (_req, res) => {
      res.json({ images: [] });
    });

    client.setArgv('vcr', 'images', 'ls', 'my-app');
    const exitCode = await vcr(client);
    expect(exitCode).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:image',
        value: 'images',
      },
    ]);
  });
});
