import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../../mocks/client';
import { resolveVcrScope } from '../../../../../src/commands/vcr/utils/resolve-vcr-scope';
import { APIError, ProjectNotFound } from '../../../../../src/util/errors-ts';
import * as linkModule from '../../../../../src/util/projects/link';
import * as getScopeModule from '../../../../../src/util/get-scope';
import * as getProjectModule from '../../../../../src/util/projects/get-project-by-id-or-name';

vi.mock('../../../../../src/util/projects/link');
vi.mock('../../../../../src/util/get-scope');
vi.mock('../../../../../src/util/projects/get-project-by-id-or-name');

const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);
const mockedGetScope = vi.mocked(getScopeModule.default);
const mockedGetProject = vi.mocked(getProjectModule.default);

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

function mockNotLinked() {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'not_linked',
    org: null,
    project: null,
  } as any);
}

function mockTeamScope() {
  mockedGetScope.mockResolvedValue({
    contextName: 'my-team',
    team: { id: 'team_dummy', slug: 'my-team' } as any,
    user: { id: 'user_dummy' } as any,
  } as any);
}

describe('resolveVcrScope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.reset();
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves the linked project when --project is not passed', async () => {
    mockLinkedProject();
    const scope = await resolveVcrScope(client, { jsonOutput: false });
    expect(scope).toEqual({
      teamId: 'team_dummy',
      teamSlug: 'my-team',
      projectId: 'prj_vcr',
      projectName: 'vcr-project',
    });
  });

  it('returns an error when no project is linked', async () => {
    mockNotLinked();
    const scope = await resolveVcrScope(client, { jsonOutput: false });
    expect(scope).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('No linked project found');
  });

  it('resolves --project within the current team scope', async () => {
    mockTeamScope();
    mockedGetProject.mockResolvedValue({
      id: 'prj_other',
      name: 'other-app',
    } as any);

    const scope = await resolveVcrScope(client, {
      project: 'other-app',
      jsonOutput: false,
    });

    expect(mockedGetProject).toHaveBeenCalledWith(
      client,
      'other-app',
      'team_dummy'
    );
    expect(scope).toEqual({
      teamId: 'team_dummy',
      teamSlug: 'my-team',
      projectId: 'prj_other',
      projectName: 'other-app',
    });
  });

  it('returns an error when --project is passed with no team context', async () => {
    mockedGetScope.mockResolvedValue({
      contextName: 'my-team',
      team: null,
      user: { id: 'user_dummy' } as any,
    } as any);

    const scope = await resolveVcrScope(client, {
      project: 'other-app',
      jsonOutput: false,
    });

    expect(scope).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('No team context found');
  });

  it('returns an error when the project is not found', async () => {
    mockTeamScope();
    mockedGetProject.mockResolvedValue(new ProjectNotFound('other-app'));

    const scope = await resolveVcrScope(client, {
      project: 'other-app',
      jsonOutput: false,
    });

    expect(scope).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Project "other-app" was not found'
    );
  });

  it('returns an error when the project lookup is forbidden', async () => {
    mockTeamScope();
    mockedGetProject.mockRejectedValue(
      new APIError('', {
        status: 403,
        headers: { get: () => undefined },
      } as any)
    );

    const scope = await resolveVcrScope(client, {
      project: 'other-app',
      jsonOutput: false,
    });

    expect(scope).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'You do not have permission to access project "other-app"'
    );
  });
});
