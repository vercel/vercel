import { isCanary } from '../../src/is-canary';
import getUpdateCommand from '../../src/get-update-command';

describe('getUpdateCommand', () => {
  it('should detect update command', async () => {
    const updateCommand = await getUpdateCommand();
    expect(updateCommand).toEqual(
      `npm i vercel@${isCanary() ? 'canary' : 'latest'}`
    );
  });
});
