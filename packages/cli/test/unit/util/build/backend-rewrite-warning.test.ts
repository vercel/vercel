import { describe, expect, it } from 'vitest';
import type { Builder } from '@vercel/build-utils';
import {
  BACKEND_REWRITE_BEHAVIOR_WARNING,
  hasBackendRewriteBehaviorChange,
} from '../../../../src/util/build/backend-rewrite-warning';

function builder(framework: string, use = '@vercel/static-build'): Builder {
  return {
    src: 'package.json',
    use,
    config: { framework },
  };
}

describe('backend rewrite behavior warning', () => {
  it.each([
    'fastapi',
    'flask',
    'django',
    'python',
    'fasthtml',
  ])('warns for an internal rewrite in a %s project', framework => {
    expect(
      hasBackendRewriteBehaviorChange({
        projectRewrites: [{ source: '/old', destination: '/new' }],
        builders: [builder(framework)],
      })
    ).toBe(true);
  });

  it('does not infer Python from the builder package', () => {
    expect(
      hasBackendRewriteBehaviorChange({
        projectRewrites: [{ source: '/old', destination: '/new' }],
        builders: [builder('other', '@vercel/python@canary')],
      })
    ).toBe(false);
  });

  it('does not warn for other frameworks or external rewrites', () => {
    expect(
      hasBackendRewriteBehaviorChange({
        projectRewrites: [{ source: '/old', destination: '/new' }],
        builders: [builder('express', '@vercel/express')],
      })
    ).toBe(false);
    expect(
      hasBackendRewriteBehaviorChange({
        projectRewrites: [
          {
            source: '/api/:path*',
            destination: 'https://api.example.com/:path*',
          },
        ],
        builders: [builder('fastapi')],
      })
    ).toBe(false);
  });

  it('does not warn for service destinations', () => {
    expect(
      hasBackendRewriteBehaviorChange({
        projectRewrites: [
          {
            source: '/api/:path(.*)?',
            destination: { service: 'backend', path: ':path' },
          },
        ],
        builders: [builder('fastapi')],
      })
    ).toBe(false);
  });

  it('describes the behavior change and its impact', () => {
    expect(BACKEND_REWRITE_BEHAVIOR_WARNING).toContain(
      'now route requests using the rewritten destination path'
    );
    expect(BACKEND_REWRITE_BEHAVIOR_WARNING).toContain(
      'previously unsupported'
    );
    expect(BACKEND_REWRITE_BEHAVIOR_WARNING).toContain('behavior');
  });
});
