import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../mocks/client';
import type { Org } from '@vercel-internals/types';

// Mock the deployment pipeline so we can hand `Now.create` a deployment that
// carries a `size_limit_exceeded` warning, exercising the warning/CTA branch in
// util/index.ts.
const processDeployment = vi.hoisted(() => vi.fn());
vi.mock('../../../src/util/deploy/process-deployment', () => ({
  default: processDeployment,
}));

import Now from '../../../src/util/index';

const org: Org = { type: 'user', id: 'user_1', slug: 'acme' };

function baseCreateOptions() {
  return {
    name: 'my-project',
    wantsPublic: false,
    meta: {},
    env: {},
    build: { env: {} },
    deployStamp: () => '',
  } as any;
}

describe('Now.create — size_limit_exceeded warning', () => {
  beforeEach(() => {
    client.reset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  // Previously this branch crashed on `hashes[sha].names.pop()` (`hashes` was
  // never populated), so the warning and upgrade CTA were unreachable. Now it
  // should warn about the skipped file and surface the plan upgrade link.
  it('warns about the skipped file and prints the upgrade CTA', async () => {
    // The API returns the deployment with a per-file size warning instead of
    // failing the whole deploy.
    processDeployment.mockResolvedValue({
      id: 'dpl_test',
      warnings: [
        {
          reason: 'size_limit_exceeded',
          sha: 'abc123',
          limit: 100 * 1024 * 1024,
        },
      ],
    });

    const now = new Now({ client });

    const deployment = await now.create(
      '/tmp/whatever',
      baseCreateOptions(),
      org,
      false
    );
    expect(deployment.id).toBe('dpl_test');

    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain('Skipping file abc123');
    expect(stderr).toContain('exceeded the limit for your plan');
    expect(stderr).toContain('https://vercel.com/account/plan');
  });
});
