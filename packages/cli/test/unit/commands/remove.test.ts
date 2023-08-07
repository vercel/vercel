import { client } from '../../mocks/client';
import {
  defaultProject,
  useProject,
  useUnknownProject,
} from '../../mocks/project';
import remove from '../../../src/commands/remove';
import { useDeployment } from '../../mocks/deployment';
import { useUser } from '../../mocks/user';

describe('remove', () => {
  it('should error if missing deployment url', async () => {
    client.setArgv('remove');
    const exitCodePromise = remove(client);

    await expect(client.stderr).toOutput(
      'Error: `vercel rm` expects at least one argument'
    );
    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('should error without calling API for invalid names', async () => {
    const badDeployName = '/#';
    client.setArgv('remove', badDeployName);
    const exitCodePromise = remove(client);

    await expect(client.stderr).toOutput(
      `Error: The provided argument "${badDeployName}" is not a valid deployment or project`
    );
    await expect(exitCodePromise).resolves.toEqual(1);
  });

  it('calls API to delete a project ', async () => {
    let deleteAPIWasCalled = false;
    const user = useUser();

    const project = useProject({
      ...defaultProject,
      id: '123',
    });

    useUnknownProject();

    const deployment = useDeployment({
      creator: user,
      project,
    });

    client.scenario.delete('/now/deployments/:id', (req, res) => {
      deleteAPIWasCalled = true;
      res.json({});
    });

    client.setArgv('remove', deployment.url, '--yes');
    await remove(client);

    expect(deleteAPIWasCalled);
  });
});
