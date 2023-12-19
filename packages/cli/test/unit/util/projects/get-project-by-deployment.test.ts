import { client } from '../../../mocks/client';
import getProjectByDeployment from '../../../../src/util/projects/get-project-by-deployment';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { useDeployment } from '../../../mocks/deployment';
import { defaultProject, useProject } from '../../../mocks/project';

describe('getProjectByDeployment', () => {
  it('should get project and deployment', async () => {
    const user = useUser();
    const { project: p } = useProject({
      ...defaultProject,
      id: 'foo',
      name: 'foo',
    });
    const d = useDeployment({
      creator: user,
      createdAt: Date.now(),
      project: p,
    });

    const { deployment, project } = await getProjectByDeployment({
      client,
      deployId: d.id,
      output: client.output,
    });

    expect(project.id).toBe(p.id);
    expect(deployment.id).toBe(d.id);
  });

  it('should get project and deployment associated to a team', async () => {
    const [team] = useTeams('team_dummy');
    const user = useUser();
    const { project: p } = useProject({
      ...defaultProject,
      id: 'foo',
      name: 'foo',
    });
    const d = useDeployment({
      creator: {
        id: team.id,
        name: team.name,
        email: user.email,
        username: team.slug,
      },
      createdAt: Date.now(),
      project: p,
    });

    client.config.currentTeam = team.id;
    d.team = team;

    const { deployment, project } = await getProjectByDeployment({
      client,
      deployId: d.id,
      output: client.output,
    });

    expect(project.id).toBe(p.id);
    expect(deployment.id).toBe(d.id);
  });

  it("should error if deployment team doesn't match current user's team", async () => {
    const [team] = useTeams('team_dummy');
    const user = useUser();
    const { project: p } = useProject({
      ...defaultProject,
      id: 'foo',
      name: 'foo',
    });
    const d = useDeployment({
      creator: {
        id: team.id,
        name: team.name,
        email: user.email,
        username: team.slug,
      },
      createdAt: Date.now(),
      project: p,
    });

    client.config.currentTeam = team.id;

    await expect(
      getProjectByDeployment({
        client,
        deployId: d.id,
        output: client.output,
      })
    ).rejects.toThrowError("Deployment doesn't belong to current team");

    client.config.currentTeam = undefined;
    d.team = team;

    await expect(
      getProjectByDeployment({
        client,
        deployId: d.id,
        output: client.output,
      })
    ).rejects.toThrowError('Deployment belongs to a different team');
  });
});
