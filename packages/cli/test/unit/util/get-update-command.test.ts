import getUpdateCommand from '../../../src/util/get-update-command';

describe('getUpdateCommand', () => {
  it.skip('should detect update command', async () => {
    const updateCommand = await getUpdateCommand();
    expect(updateCommand).toEqual(`pnpm i vercel@latest`);
  });
});
