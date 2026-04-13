import type { Files } from '@vercel/build-utils';
import type { RouteWithSrc } from '@vercel/routing-utils';
import type { NextPrerenderedRoutes, RoutesManifest } from '../../src/utils';

const entryDirectory = 'output';
const staticPages: Files = {};
const routesManifest = {
  version: 4,
  pages404: true,
  basePath: undefined,
  redirects: [],
  rewrites: {
    beforeFiles: [],
    afterFiles: [],
    fallback: [],
  },
  dynamicRoutes: [],
  staticRoutes: [],
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'fr'],
    localeDetection: false,
  },
} as RoutesManifest;
const prerenderManifest = {
  bypassToken: null,
  staticRoutes: {},
  blockingFallbackRoutes: {
    '/output/gsp/blocking/[slug]': {
      routeRegex: '^/gsp/blocking/([^/]+?)(?:/)?$',
      dataRoute: null,
      fallback: null,
      dataRouteRegex: null,
      renderingMode: undefined,
      allowHeader: undefined,
    },
  },
  fallbackRoutes: {},
} as NextPrerenderedRoutes;

function getDynamicRoutes(): RouteWithSrc[] {
  return [
    {
      src: '^/gsp/blocking/([^/]+?)(?:/)?$',
      dest: '/output/gsp/blocking/[slug]',
    },
  ];
}

describe('localizeDynamicRoutes', () => {
  afterEach(() => {
    delete process.env.NEXT_EXPERIMENTAL_DEFER_DEFAULT_LOCALE_REWRITE;
    jest.resetModules();
  });

  it('keeps localized dynamic routes matching default-locale URLs by default', async () => {
    const { localizeDynamicRoutes } = await import('../../src/utils');
    const [route] = localizeDynamicRoutes(
      getDynamicRoutes(),
      '',
      entryDirectory,
      staticPages,
      prerenderManifest,
      routesManifest
    );

    expect(route).toBeDefined();
    expect(new RegExp(route.src).test('/gsp/blocking/hello')).toBe(true);
    expect(new RegExp(route.src).test('/fr/gsp/blocking/hello')).toBe(true);
  });

  it('emits separate locale and default-locale routes when default locale rewrites are deferred', async () => {
    process.env.NEXT_EXPERIMENTAL_DEFER_DEFAULT_LOCALE_REWRITE = '1';

    const { localizeDynamicRoutes } = await import('../../src/utils');
    const routes = localizeDynamicRoutes(
      getDynamicRoutes(),
      '',
      entryDirectory,
      staticPages,
      prerenderManifest,
      routesManifest
    );
    const localeRoute = routes.find(route =>
      route.src.includes('<nextLocale>')
    );
    const defaultLocaleRoute = routes.find(
      route => !route.src.includes('<nextLocale>')
    );

    expect(localeRoute).toBeDefined();
    expect(defaultLocaleRoute).toBeDefined();
    expect(new RegExp(localeRoute!.src).test('/fr/gsp/blocking/hello')).toBe(
      true
    );
    expect(new RegExp(localeRoute!.src).test('/gsp/blocking/hello')).toBe(
      false
    );
    expect(
      new RegExp(defaultLocaleRoute!.src).test('/gsp/blocking/hello')
    ).toBe(true);
    expect(defaultLocaleRoute!.dest).toBe('/output/gsp/blocking/[slug]');
    expect(localeRoute!.dest).toBe('/output/$nextLocale/gsp/blocking/[slug]');
  });
});
