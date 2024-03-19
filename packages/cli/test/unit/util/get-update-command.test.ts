import { describe, expect, it } from 'vitest';
import getUpdateCommand from '../../../src/util/get-update-command';

describe('getUpdateCommand', () => {
  it('should detect update command', async () => {
    const updateCommand = await getUpdateCommand();
    expect(updateCommand).toEqual(`pnpm i vercel@latest`);
  });
});
