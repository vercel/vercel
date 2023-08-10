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

  it('does not remove in-progress deployments', async () => {
    const user = useUser();

    const project = useProject({
      ...defaultProject,
      id: '123',
    });

    useUnknownProject();

    client.scenario.get('/v3/now/aliases', (_req, res) => {
      res.json({ aliases: [] });
    });

    const testCases = [
      ['READY', true],
      ['QUEUED', false],
      ['BUILDING', false],
      ['INITIALIZING', false],
    ] as const;

    const deployments = testCases
      .map(([state]) =>
        useDeployment({
          creator: user,
          project,
          state,
        })
      )
      // TODO: delete me when https://github.com/vercel/vercel/pull/10316 is resolved
      .map(deployment =>
        Object.assign(deployment, {
          uid: deployment.id,
          state: deployment.status,
        })
      );

    const deletedDeployments = new Set<string>();

    client.scenario.delete('/now/deployments/:id', (req, res) => {
      deletedDeployments.add(req.params.id);
      res.json({});
    });

    client.setArgv('remove', `${project.project.name}`, '--safe', '--yes');
    await remove(client);

    for (let i = 0; i < deployments.length; i += 1) {
      const { id, status } = deployments[i];
      const expectedToBeDeleted = testCases.find(
        testCase => testCase[0] === status
      )![1];
      expect(deletedDeployments.has(id)).toBe(expectedToBeDeleted);
    }
  });
});
