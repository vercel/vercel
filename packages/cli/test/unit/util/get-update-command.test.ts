import { describe, expect, it } from 'vitest';
import getUpdateCommand, {
  isGlobal,
} from '../../../src/util/get-update-command';

describe('getUpdateCommand', () => {
  it('should detect update command', async () => {
    const updateCommand = await getUpdateCommand();
    if (await isGlobal()) {
      expect(updateCommand).toEqual(`pnpm i -g vercel@latest`);
    } else {
      expect(updateCommand).toEqual(`pnpm i vercel@latest`);
    }
  });
});
