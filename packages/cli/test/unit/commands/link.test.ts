import { basename, join } from 'path';
import { mkdtemp, readJSON, remove } from 'fs-extra';
import link from '../../../src/commands/link';
import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import { useTeams } from '../../mocks/team';
import {
  defaultProject,
  useProject,
  useUnknownProject,
} from '../../mocks/project';
import { tmpdir } from 'os';

describe('link', () => {
  const origCwd = process.cwd();

  it('should prompt for link', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'cli-'));
    try {
      process.chdir(cwd);
      const user = useUser();
      useTeams('team_dummy');
      const { project } = useProject({
        ...defaultProject,
        id: basename(cwd),
        name: basename(cwd),
      });
      useUnknownProject();

      const exitCodePromise = link(client);

      await expect(client.stderr).toOutput('Set up');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Which scope should contain your project?'
      );
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Link to it?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        `Linked to ${user.username}/${project.name} (created .vercel and added it to .gitignore)`
      );

      await expect(exitCodePromise).resolves.toEqual(0);

      const projectJson = await readJSON(join(cwd, '.vercel/project.json'));
      expect(projectJson.orgId).toEqual(user.id);
      expect(projectJson.projectId).toEqual(project.id);
    } finally {
      process.chdir(origCwd);
      await remove(cwd);
    }
  });

  it('should allow specifying `--project` flag', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'cli-'));
    try {
      process.chdir(cwd);
      const user = useUser();
      useTeams('team_dummy');
      const { project } = useProject({
        ...defaultProject,
        id: basename(cwd),
        name: basename(cwd),
      });
      useUnknownProject();

      client.setArgv('--project', project.name!, '--yes');
      const exitCodePromise = link(client);

      await expect(client.stderr).toOutput(
        `Linked to ${user.username}/${project.name} (created .vercel and added it to .gitignore)`
      );

      await expect(exitCodePromise).resolves.toEqual(0);

      const projectJson = await readJSON(join(cwd, '.vercel/project.json'));
      expect(projectJson.orgId).toEqual(user.id);
      expect(projectJson.projectId).toEqual(project.id);
    } finally {
      process.chdir(origCwd);
      await remove(cwd);
    }
  });

  it('should allow overwriting existing link', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'cli-'));
    try {
      process.chdir(cwd);
      const user = useUser();
      useTeams('team_dummy');
      const { project: proj1 } = useProject({
        ...defaultProject,
        id: 'one',
        name: 'one',
      });
      const { project: proj2 } = useProject({
        ...defaultProject,
        id: 'two',
        name: 'two',
      });
      useUnknownProject();

      client.setArgv('--project', proj1.name!, '--yes');
      await expect(link(client)).resolves.toEqual(0);

      let projectJson = await readJSON(join(cwd, '.vercel/project.json'));
      expect(projectJson.orgId).toEqual(user.id);
      expect(projectJson.projectId).toEqual(proj1.id);

      client.setArgv('--project', proj2.name!, '--yes');
      await expect(link(client)).resolves.toEqual(0);

      projectJson = await readJSON(join(cwd, '.vercel/project.json'));
      expect(projectJson.orgId).toEqual(user.id);
      expect(projectJson.projectId).toEqual(proj2.id);
    } finally {
      process.chdir(origCwd);
      await remove(cwd);
    }
  });
});
