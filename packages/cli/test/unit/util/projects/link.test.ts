import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { getLinkedProject } from '../../../../src/util/projects/link';
import { client } from '../../../mocks/client';

import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

type UnPromisify<T> = T extends Promise<infer U> ? U : T;

const fixture = (name: string) =>
  join(__dirname, '../../../fixtures/unit', name);

describe('getLinkedProject', () => {
  it('should fail to return a link when token is missing', async () => {
    const cwd = fixture('vercel-pull-next');

    useUser();
    useTeams('team_dummy', { failMissingToken: true });
    useProject({
      ...defaultProject,
      id: 'vercel-pull-next',
      name: 'vercel-pull-next',
    });

    let link: UnPromisify<ReturnType<typeof getLinkedProject>> | undefined;
    let error: Error | undefined;
    try {
      link = await getLinkedProject(client, cwd);
    } catch (err) {
      error = err as Error;
    }

    expect(link).toBeUndefined();

    if (!error) {
      throw new Error(`Expected an error to be thrown.`);
    }
    expect(error.message).toBe(
      'The specified token is not valid. Use `vercel login` to generate a new token.'
    );
  });

  it('should fail to return a link when token is invalid', async () => {
    const cwd = fixture('vercel-pull-next');

    useUser();
    useTeams('team_dummy', { failInvalidToken: true });
    useProject({
      ...defaultProject,
      id: 'vercel-pull-next',
      name: 'vercel-pull-next',
    });

    let link: UnPromisify<ReturnType<typeof getLinkedProject>> | undefined;
    let error: Error | undefined;
    try {
      link = await getLinkedProject(client, cwd);
    } catch (err) {
      error = err as Error;
    }

    expect(link).toBeUndefined();

    if (!error) {
      throw new Error(`Expected an error to be thrown.`);
    }
    expect(error.message).toBe(
      'The specified token is not valid. Use `vercel login` to generate a new token.'
    );
  });

  it('should fail to return a link when no access to team', async () => {
    const cwd = fixture('vercel-pull-next');

    useUser();
    useTeams('team_dummy', { failNoAccess: true });
    useProject({
      ...defaultProject,
      id: 'vercel-pull-next',
      name: 'vercel-pull-next',
    });

    let link: UnPromisify<ReturnType<typeof getLinkedProject>> | undefined;
    let error: Error | undefined;
    try {
      link = await getLinkedProject(client, cwd);
    } catch (err) {
      error = err as Error;
    }

    expect(link).toBeUndefined();

    if (!error) {
      throw new Error(`Expected an error to be thrown.`);
    }
    expect(error.message).toBe(
      'Could not retrieve Project Settings. To link your Project, remove the `.vercel` directory and deploy again.'
    );
  });

  it('should return link with `project.json`', async () => {
    const cwd = fixture('vercel-pull-next');

    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-pull-next',
      name: 'vercel-pull-next',
    });

    const link = await getLinkedProject(client, cwd);
    if (link.status !== 'linked') {
      throw new Error('Expected to be linked');
    }
    expect(link.org.id).toEqual('team_dummy');
    expect(link.org.type).toEqual('team');
    expect(link.project.id).toEqual('vercel-pull-next');
    expect(link.repoRoot).toBeUndefined();
  });

  it('should return link with `repo.json`', async () => {
    const cwd = fixture('monorepo-link');

    useUser();
    useTeams('team_dummy');

    // dashboard
    useProject({
      ...defaultProject,
      id: 'QmbKpqpiUqbcke',
      name: 'monorepo-dashboard',
    });
    let link = await getLinkedProject(client, join(cwd, 'dashboard'));
    if (link.status !== 'linked') {
      throw new Error('Expected to be linked');
    }
    expect(link.org.id).toEqual('team_dummy');
    expect(link.org.type).toEqual('team');
    expect(link.project.id).toEqual('QmbKpqpiUqbcke');
    expect(link.repoRoot).toEqual(cwd);

    // marketing
    useProject({
      ...defaultProject,
      id: 'QmX6P93ChNDoZP',
      name: 'monorepo-marketing',
    });
    link = await getLinkedProject(client, join(cwd, 'marketing/subdir'));
    if (link.status !== 'linked') {
      throw new Error('Expected to be linked');
    }
    expect(link.org.id).toEqual('team_dummy');
    expect(link.org.type).toEqual('team');
    expect(link.project.id).toEqual('QmX6P93ChNDoZP');
    expect(link.repoRoot).toEqual(cwd);

    // blog
    useProject({
      ...defaultProject,
      id: 'QmScb7GPQt6gsS',
      name: 'monorepo-blog',
    });
    link = await getLinkedProject(client, join(cwd, 'blog'));
    if (link.status !== 'linked') {
      throw new Error('Expected to be linked');
    }
    expect(link.org.id).toEqual('team_dummy');
    expect(link.org.type).toEqual('team');
    expect(link.project.id).toEqual('QmScb7GPQt6gsS');
    expect(link.repoRoot).toEqual(cwd);
  });

  it('should show project selector prompt link with `repo.json`', async () => {
    const cwd = fixture('monorepo-link');

    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'QmbKpqpiUqbcke',
      name: 'monorepo-dashboard',
    });

    const linkPromise = getLinkedProject(client, cwd);

    // wait for prompt
    await expect(client.stderr).toOutput('Please select a Project:');

    // make selection
    client.stdin.write('\r');

    const link = await linkPromise;
    if (link.status !== 'linked') {
      throw new Error('Expected to be linked');
    }
    expect(link.org.id).toEqual('team_dummy');
    expect(link.org.type).toEqual('team');
    expect(link.project.id).toEqual('QmbKpqpiUqbcke');
    expect(link.repoRoot).toEqual(cwd);
  });
});
