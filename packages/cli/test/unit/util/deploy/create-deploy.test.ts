import { describe, expect, it, vi } from 'vitest';
import type { Org } from '@vercel-internals/types';
import type Client from '../../../../src/util/client';
import type Now from '../../../../src/util';
import type { CreateOptions } from '../../../../src/util';

const generateCertForDeploy = vi.hoisted(() => vi.fn());
vi.mock('../../../../src/util/deploy/generate-cert-for-deploy', () => ({
  default: generateCertForDeploy,
}));

import createDeploy from '../../../../src/util/deploy/create-deploy';

const org: Org = { type: 'user', id: 'user_1', slug: 'acme' };

function createOptions(): CreateOptions {
  return {
    name: 'my-project',
    meta: {},
    env: {},
    build: { env: {} },
    buildMachine: 'turbo',
    deployStamp: () => '',
  };
}

describe('createDeploy()', () => {
  it('retains buildMachine when retrying after certificate generation', async () => {
    const createArgs = createOptions();
    const certMissingError = Object.assign(new Error('Certificate missing'), {
      status: 400,
      code: 'cert_missing',
      value: 'my-project.example.com',
    });
    const now = {
      create: vi
        .fn()
        .mockRejectedValueOnce(certMissingError)
        .mockResolvedValueOnce({ id: 'dpl_test' }),
    } as unknown as Now;

    await createDeploy(
      {} as Client,
      now,
      'acme',
      '/project',
      createArgs,
      org,
      false
    );

    expect(generateCertForDeploy).toHaveBeenCalledOnce();
    expect(now.create).toHaveBeenCalledTimes(2);
    expect(now.create).toHaveBeenNthCalledWith(
      2,
      '/project',
      createArgs,
      org,
      false,
      undefined
    );
    expect(createArgs.buildMachine).toBe('turbo');
  });
});
