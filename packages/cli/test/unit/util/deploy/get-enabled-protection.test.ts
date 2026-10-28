import { describe, expect, it, vi } from 'vitest';
import {
  getEnabledProtection,
  getProtectionForAlias,
  getProtectionForDeployment,
} from '../../../../src/util/deploy/get-enabled-protection';

const project = { id: 'prj_123', accountId: 'team_123' };

function fakeClient(fetch: () => Promise<unknown>): any {
  return { fetch: vi.fn(fetch) };
}

describe('getEnabledProtection', () => {
  it('lists each protection that is on', async () => {
    const client = fakeClient(async () => ({
      ssoProtection: { deploymentType: 'all_except_custom_domains' },
      passwordProtection: { deploymentType: 'preview' },
    }));

    const methods = await getEnabledProtection(client, project);

    expect(methods?.map(m => m.id)).toEqual([
      'vercel_authentication',
      'password',
    ]);
    expect(methods?.map(m => m.deploymentType)).toEqual([
      'all_except_custom_domains',
      'preview',
    ]);
    expect(client.fetch).toHaveBeenCalledWith('/v9/projects/prj_123', {
      accountId: 'team_123',
    });
  });

  it('returns an empty list when protection is off', async () => {
    const methods = await getEnabledProtection(
      fakeClient(async () => ({
        ssoProtection: null,
        passwordProtection: null,
      })),
      project
    );

    expect(methods).toEqual([]);
  });

  it('returns null when the settings cannot be read', async () => {
    const methods = await getEnabledProtection(
      fakeClient(async () => {
        throw new Error('forbidden');
      }),
      project
    );

    expect(methods).toBeNull();
  });
});

describe('getProtectionForDeployment', () => {
  const sso = (deploymentType?: string) => ({
    setting: 'ssoProtection' as const,
    id: 'vercel_authentication' as const,
    name: 'Vercel Authentication' as const,
    deploymentType,
  });
  const production = {
    target: 'production',
    alias: ['my-app.example.com'],
    aliasAssigned: true,
  };
  // `--skip-domain`, `--no-wait`, or a failed alias: no production domain.
  const productionWithoutDomain = { target: 'production', alias: [] };

  it('keeps every method for preview deployments', () => {
    const methods = [sso('all_except_custom_domains'), sso('preview')];
    expect(getProtectionForDeployment(methods, { target: 'preview' })).toEqual(
      methods
    );
    expect(getProtectionForDeployment(methods, { target: null })).toEqual(
      methods
    );
  });

  it.each([
    'all_except_custom_domains',
    'prod_deployment_urls_and_all_previews',
    'preview',
  ])('drops %s when a production domain was assigned, since it stays public', (type: string) => {
    expect(getProtectionForDeployment([sso(type)], production)).toEqual([]);
  });

  it('keeps All Deployments and unknown scopes for a production domain', () => {
    const methods = [sso('all'), sso(undefined), sso('some_future_scope')];
    expect(getProtectionForDeployment(methods, production)).toEqual(methods);
  });

  it('keeps Standard Protection when production has no domain, since it protects the deployment URL', () => {
    const methods = [
      sso('all_except_custom_domains'),
      sso('prod_deployment_urls_and_all_previews'),
      sso('all'),
    ];
    expect(
      getProtectionForDeployment(methods, productionWithoutDomain)
    ).toEqual(methods);
  });

  it('drops Only Preview Deployments for production without a domain', () => {
    expect(
      getProtectionForDeployment([sso('preview')], productionWithoutDomain)
    ).toEqual([]);
  });

  it('returns an empty list when the settings could not be read', () => {
    expect(getProtectionForDeployment(null, production)).toEqual([]);
  });
});

describe('getProtectionForAlias', () => {
  const sso = (deploymentType?: string) => ({
    setting: 'ssoProtection' as const,
    id: 'vercel_authentication' as const,
    name: 'Vercel Authentication' as const,
    deploymentType,
  });
  const production = { target: 'production' };

  it('keeps Standard Protection for a production alias that is not a project domain', () => {
    const methods = [
      sso('all_except_custom_domains'),
      sso('prod_deployment_urls_and_all_previews'),
      sso('all'),
    ];
    expect(getProtectionForAlias(methods, production, false)).toEqual(methods);
  });

  it('drops Standard Protection for a production alias that is a project domain', () => {
    expect(
      getProtectionForAlias(
        [sso('all_except_custom_domains'), sso('all')],
        production,
        true
      )
    ).toEqual([sso('all')]);
  });

  it('drops Only Preview Deployments for any production alias', () => {
    expect(getProtectionForAlias([sso('preview')], production, false)).toEqual(
      []
    );
  });

  it('keeps every method for a preview alias, even a project domain', () => {
    const methods = [sso('all_except_custom_domains'), sso('preview')];
    expect(getProtectionForAlias(methods, { target: null }, true)).toEqual(
      methods
    );
  });

  it('returns an empty list when the settings could not be read', () => {
    expect(getProtectionForAlias(null, production, false)).toEqual([]);
  });
});
