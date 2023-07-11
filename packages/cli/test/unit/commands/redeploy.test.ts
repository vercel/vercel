import { client } from '../../mocks/client';
import { defaultProject, useProject } from '../../mocks/project';
import redeploy from '../../../src/commands/redeploy';
import { setupUnitFixture } from '../../helpers/setup-unit-fixture';
import { useDeployment } from '../../mocks/deployment';
import { useTeams } from '../../mocks/team';
import { useUser } from '../../mocks/user';
import { Deployment } from '@vercel-internals/types';

describe('redeploy', () => {
  it('should error if missing deployment url', async () => {
    client.setArgv('redeploy');
    const exitCodePromise = redeploy(client);

    await expect(client.stderr).toOutput(
      'Missing required deployment id or url:'
    );
    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should error if deployment not found', async () => {
    initRedeployTest();
    client.setArgv('redeploy', 'foo');
    const exitCodePromise = redeploy(client);

    await expect(client.stderr).toOutput('Fetching deployment "foo" in ');
    await expect(client.stderr).toOutput(
      'Error: Can\'t find the deployment "foo" under the context'
    );
    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should error if deployment belongs to another team', async () => {
    const { fromDeployment } = initRedeployTest();
    fromDeployment.team = {
      id: 'abc',
      name: 'abc',
      slug: 'abc',
    };
    client.setArgv('rollback', fromDeployment.id);
    const exitCodePromise = redeploy(client);

    await expect(client.stderr).toOutput(
      `Fetching deployment "${fromDeployment.id}" in ${fromDeployment.creator?.username}`
    );
    await expect(client.stderr).toOutput(
      'Error: Deployment belongs to a different team'
    );

    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should redeploy an existing deployment', async () => {
    const { fromDeployment } = initRedeployTest();
    client.setArgv('rollback', fromDeployment.id);

    const exitCodePromise = redeploy(client);
    await expect(client.stderr).toOutput(
      `Fetching deployment "${fromDeployment.id}" in ${fromDeployment.creator?.username}`
    );
    await expect(client.stderr).toOutput('Production');

    await expect(exitCodePromise).resolves.toEqual(0);
  });

  it('should redeploy and not wait for completion', async () => {
    const { fromDeployment, toDeployment } = initRedeployTest();
    toDeployment.readyState = 'QUEUED';
    client.setArgv('rollback', fromDeployment.id, '--no-wait');

    const exitCodePromise = redeploy(client);
    await expect(client.stderr).toOutput(
      `Fetching deployment "${fromDeployment.id}" in ${fromDeployment.creator?.username}`
    );
    await expect(client.stderr).toOutput(
      'Note: Deployment is still processing'
    );

    await expect(exitCodePromise).resolves.toEqual(0);
  });

  it('should redeploy to preview', async () => {
    const { fromDeployment } = initRedeployTest({ target: null });
    client.setArgv('rollback', fromDeployment.id);
    const exitCodePromise = redeploy(client);
    await expect(client.stderr).toOutput(
      `Fetching deployment "${fromDeployment.id}" in ${fromDeployment.creator?.username}`
    );
    await expect(client.stderr).toOutput('Preview');
    await expect(exitCodePromise).resolves.toEqual(0);
  });
});

function initRedeployTest({ target }: { target?: Deployment['target'] } = {}) {
  setupUnitFixture('commands/redeploy/simple-static');
  const user = useUser();
  useTeams('team_dummy');
  const { project } = useProject({
    ...defaultProject,
    id: 'vercel-redeploy',
    name: 'vercel-redeploy',
  });
  const fromDeployment = useDeployment({ creator: user, target });
  const toDeployment = useDeployment({ creator: user, target });

  client.scenario.post(`/v13/deployments`, (req, res) => {
    res.json(toDeployment);
  });

  return {
    project,
    fromDeployment,
    toDeployment,
  };
}
