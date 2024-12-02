import { generateNewToken } from './common';
import { createDeployment } from '../src/index';
import { beforeEach, describe, expect, it } from 'vitest';

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
    } catch (_error: unknown) {
      const error = _error as NodeJS.ErrnoException;
      expect(error.code).toEqual('invalid_path');
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
    } catch (_error: unknown) {
      const error = _error as NodeJS.ErrnoException;
      expect(error.code).toEqual('invalid_path');
    }
  });
});
