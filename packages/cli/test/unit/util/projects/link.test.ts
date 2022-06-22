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
      error = err;
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
      error = err;
    }

    expect(link).toBeUndefined();

    if (!error) {
      throw new Error(`Expected an error to be thrown.`);
    }
    expect(error.message).toBe(
      'Could not retrieve Project Settings. To link your Project, remove the `.vercel` directory and deploy again.'
    );
  });
});
