import { getDynamicRoutes } from '../../src/utils';

const prerenderManifest = {
  fallbackRoutes: {},
  blockingFallbackRoutes: {},
  omittedRoutes: {},
} as any;

async function getPrefetchSegmentRoute({
  page,
  source,
  destination,
  routeKey,
}: {
  page: string;
  source: string;
  destination: string;
  routeKey: string;
}) {
  const routes = await getDynamicRoutes({
    entryPath: '/',
    entryDirectory: '',
    dynamicPages: [page],
    routesManifest: {
      version: 4,
      dynamicRoutes: [
        {
          page,
          regex: '^/catch/(.+?)(?:/)?$',
          namedRegex: `^/catch/(?<${routeKey}>.+?)(?:/)?$`,
          routeKeys: { [routeKey]: routeKey },
          prefetchSegmentDataRoutes: [
            {
              source,
              destination,
              routeKeys: { [routeKey]: routeKey },
            },
          ],
        },
      ],
    } as any,
    isAppPPREnabled: true,
    isAppClientSegmentCacheEnabled: true,
    isAppClientParamParsingEnabled: true,
    prerenderManifest,
  });

  const prefetchRoute = routes.find(route =>
    route.src.includes('\\.segments/catch/')
  );
  expect(prefetchRoute).toBeDefined();
  return prefetchRoute!;
}

describe('getDynamicRoutes', () => {
  it('remaps the segment suffix capture for params named "segments"', async () => {
    const route = await getPrefetchSegmentRoute({
      page: '/catch/[...segments]',
      routeKey: 'nxtPsegments',
      source:
        '^/catch/(?<nxtPsegments>.+?)\\.segments/catch/\\$c\\$segments(?<segment>/__PAGE__\\.segment\\.rsc|\\.segment\\.rsc)(?:/)?$',
      destination: '/catch/[...segments].segments/catch/$c$segments$segment',
    });

    expect(route.src).toContain('(?<nxtSegmentSuffix>');
    expect(route.dest).toBe(
      '/catch/[...segments].segments/catch/$c$segments$nxtSegmentSuffix?nxtPsegments=$nxtPsegments'
    );
  });

  it('only remaps the trailing "$segment" token when a literal "$segment" is present', async () => {
    const route = await getPrefetchSegmentRoute({
      page: '/catch/[...segment]',
      routeKey: 'nxtPsegment',
      source:
        '^/catch/(?<nxtPsegment>.+?)\\.segments/catch/\\$c\\$segment(?<segment>/__PAGE__\\.segment\\.rsc|\\.segment\\.rsc)(?:/)?$',
      destination: '/catch/[...segment].segments/catch/$c$segment$segment',
    });

    expect(route.src).toContain('\\$c\\$segment(?<nxtSegmentSuffix>');
    expect(route.dest).toBe(
      '/catch/[...segment].segments/catch/$c$segment$nxtSegmentSuffix?nxtPsegment=$nxtPsegment'
    );
  });
});
