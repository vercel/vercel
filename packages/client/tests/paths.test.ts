import { generateNewToken } from './common';
import { createDeployment } from '../src/index';

describe('path handling', () => {
  let token = '';

  beforeEach(async () => {
    token = await generateNewToken();
  });

  it('will fali with a relative path', async () => {
    try {
      await createDeployment(
        {
          token,
          path: './fixtures/v2/now.json',
        },
        {
          name: 'now-client-tests-v2',
        }
      );
    } catch (e) {
      expect(e.code).toEqual('invalid_path');
    }
  });

  it('will fali with an array of relative paths', async () => {
    try {
      await createDeployment(
        {
          token,
          path: ['./fixtures/v2/now.json'],
        },
        {
          name: 'now-client-tests-v2',
        }
      );
    } catch (e) {
      expect(e.code).toEqual('invalid_path');
    }
  });
});
