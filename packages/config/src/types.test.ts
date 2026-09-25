import { describe, expect, it } from 'vitest';
import type { FunctionConfig, VercelConfig } from './types';

describe('FunctionConfig', () => {
  it('accepts maxConcurrency', () => {
    const config: FunctionConfig = { maxConcurrency: 8 };

    expect(config.maxConcurrency).toBe(8);
  });
});

describe('VercelConfig', () => {
  it('accepts services and service-targeted rewrites', () => {
    const config: VercelConfig = {
      services: {
        my_frontend: { root: 'frontend/' },
        my_backend: { root: 'backend/', entrypoint: 'main:app' },
      },
      rewrites: [
        { source: '/api/(.*)', destination: { service: 'my_backend' } },
        { source: '/(.*)', destination: { service: 'my_frontend' } },
      ],
    };

    expect(config.rewrites?.[0].destination).toEqual({
      service: 'my_backend',
    });
  });
});
