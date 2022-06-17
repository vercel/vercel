import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import list from '../../../src/commands/list';
import { join } from 'path';

const fixture = (name: string) =>
  join(__dirname, '../../fixtures/unit/commands/list', name);

describe('list', () => {
  const originalCwd = process.cwd();

  it('should exit if directory is not linked to a project', async () => {
    const user = useUser();
    client.setArgv('ls', '-S', user.username);
    const exitCode = await list(client);
    expect(exitCode).toEqual(0);
    expect(client.mockOutput.mock.calls[0][0]).toEqual(
      "Looks like this directory isn't linked to a Vercel deployment. Please run `vercel link` to link it."
    );
  });
  it('should get deployments from a project linked by a directory', async () => {
    const cwd = fixture('project');
    try {
      process.chdir(cwd);
      // const exitCode = await list(client);
      // console.log('exit code:', exitCode);
      // console.log(client.mockOutput.mock);
    } finally {
      process.chdir(originalCwd);
    }
  });
});
