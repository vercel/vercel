import { describe, expect, it } from 'vitest';
import { getDeploymentTargetUrl } from '../../../../src/util/deploy/get-deployment-target-url';

describe('getDeploymentTargetUrl', () => {
  it('returns the project production domain for production deployments', () => {
    // `alias` minus `automaticAliases` are the publicly accessible project /
    // custom production domains; the auto-generated aliases may be protected.
    expect(
      getDeploymentTargetUrl({
        target: 'production',
        alias: [
          'my-app-rauchg.vercel.app',
          'my-app-three-sepia.vercel.app',
          'my-app-rauchg-rauchg.vercel.app',
        ],
        automaticAliases: [
          'my-app-rauchg.vercel.app',
          'my-app-rauchg-rauchg.vercel.app',
        ],
      })
    ).toEqual({ label: 'Production', url: 'my-app-three-sepia.vercel.app' });
  });

  it('prefers a custom domain over the Vercel-provided domain', () => {
    expect(
      getDeploymentTargetUrl({
        target: 'production',
        alias: ['my-app-three-sepia.vercel.app', 'example.com'],
        automaticAliases: [],
      })
    ).toEqual({ label: 'Production', url: 'example.com' });
  });

  it('falls back to the only assigned domain when there is no custom domain', () => {
    expect(
      getDeploymentTargetUrl({
        target: 'production',
        alias: ['my-app.vercel.app'],
        automaticAliases: [],
      })
    ).toEqual({ label: 'Production', url: 'my-app.vercel.app' });
  });

  it('returns undefined for production deployments with no project domain', () => {
    expect(
      getDeploymentTargetUrl({
        target: 'production',
        alias: ['my-app-rauchg.vercel.app'],
        automaticAliases: ['my-app-rauchg.vercel.app'],
      })
    ).toBeUndefined();
  });

  it('returns the branch alias for preview deployments', () => {
    expect(
      getDeploymentTargetUrl({
        target: null,
        alias: ['my-app-git-feature-branch-rauchg.vercel.app'],
        automaticAliases: ['my-app-git-feature-branch-rauchg.vercel.app'],
      })
    ).toEqual({
      label: 'Preview',
      url: 'my-app-git-feature-branch-rauchg.vercel.app',
    });
  });

  it('selects the branch alias even when the project name contains "-git-"', () => {
    // For a project literally named `my-git-app`, multiple aliases contain
    // `-git-`; the branch alias is the one with the extra inserted segment.
    expect(
      getDeploymentTargetUrl({
        target: null,
        alias: [],
        automaticAliases: [
          'my-git-app-acme.vercel.app',
          'my-git-app-git-main-acme.vercel.app',
        ],
      })
    ).toEqual({
      label: 'Preview',
      url: 'my-git-app-git-main-acme.vercel.app',
    });
  });

  it('returns undefined for preview deployments with no branch alias', () => {
    expect(
      getDeploymentTargetUrl({
        target: null,
        alias: [],
        automaticAliases: [],
      })
    ).toBeUndefined();
  });
});
