import { describe, beforeEach, expect, it, vi } from 'vitest';
import inputProject from '../../../../src/util/input/input-project';
import { ProjectNotFound } from '../../../../src/util/errors-ts';
import type Client from '../../../../src/util/client';
import type { Org } from '@vercel-internals/types';
import getProjectByIdOrName from '../../../../src/util/projects/get-project-by-id-or-name';

vi.mock('../../../../src/util/projects/get-project-by-id-or-name');

const mockedGetProject = vi.mocked(getProjectByIdOrName);

const org: Org = { type: 'team', id: 'team_1', slug: 'acme' };

describe('inputProject', () => {
  const client = { nonInteractive: false } as unknown as Client;

  beforeEach(() => {
    vi.clearAllMocks();
    (client as { nonInteractive: boolean }).nonInteractive = false;
  });

  it('returns unambiguous auto-detected project in non-interactive mode', async () => {
    const project = {
      id: 'prj_1',
      name: 'my-app',
      accountId: org.id,
      createdAt: 0,
      updatedAt: 0,
    };
    mockedGetProject.mockImplementation(async (_c, name: string) => {
      if (name === 'my-app') {
        return project as Awaited<ReturnType<typeof getProjectByIdOrName>>;
      }
      return new ProjectNotFound(name);
    });
    (client as { nonInteractive: boolean }).nonInteractive = true;

    await expect(
      inputProject(client, org, 'my-app', false, false)
    ).resolves.toEqual(project);
  });

  it('throws HEADLESS in non-interactive mode when no project is auto-detected', async () => {
    mockedGetProject.mockResolvedValue(new ProjectNotFound('my-app'));
    (client as { nonInteractive: boolean }).nonInteractive = true;

    await expect(
      inputProject(client, org, 'my-app', false, false)
    ).rejects.toMatchObject({ code: 'HEADLESS' });
  });
});
