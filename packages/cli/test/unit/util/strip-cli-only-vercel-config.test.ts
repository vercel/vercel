import { describe, expect, it } from 'vitest';
import { stripCliOnlyVercelConfigFields } from '../../../src/util/strip-cli-only-vercel-config';

describe('stripCliOnlyVercelConfigFields', () => {
  it('removes experimentalEnvironmentVariables before deployment', () => {
    const config = stripCliOnlyVercelConfigFields({
      rewrites: [{ source: '/api', destination: '/api' }],
      experimentalEnvironmentVariables: {
        API_KEY: {
          type: 'secret',
          required: true,
        },
      },
    });

    expect(config).toEqual({
      rewrites: [{ source: '/api', destination: '/api' }],
    });
  });

  it('preserves config when no CLI-only fields are present', () => {
    const config = stripCliOnlyVercelConfigFields({
      crons: [{ path: '/api/cron', schedule: '0 0 * * *' }],
    });

    expect(config).toEqual({
      crons: [{ path: '/api/cron', schedule: '0 0 * * *' }],
    });
  });
});
