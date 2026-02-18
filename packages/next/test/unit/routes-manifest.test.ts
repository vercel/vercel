import fs from 'fs-extra';
import { getRoutesManifest } from '../../src/utils';
import { genDir } from '../utils';

describe('getRoutesManifest', () => {
  it('preserves route keys for params named "segments"', async () => {
    const entryPath = await genDir({
      '.next/routes-manifest.json': JSON.stringify(
        {
          version: 4,
          pages404: true,
          basePath: '',
          redirects: [],
          rewrites: {
            beforeFiles: [],
            afterFiles: [],
            fallback: [],
          },
          staticRoutes: [],
          dynamicRoutes: [
            {
              page: '/catch/[...segments]',
              regex: '^/catch/(?<nxtPsegments>.+?)(?:/)?$',
              namedRegex: '^/catch/(?<nxtPsegments>.+?)(?:/)?$',
              routeKeys: {
                nxtPsegments: 'nxtPsegments',
              },
              prefetchSegmentDataRoutes: [
                {
                  source:
                    '^/catch/(?<nxtPsegments>.+?)\\.segments/catch/\\$c\\$segments(?<segment>/__PAGE__\\.segment\\.rsc|\\.segment\\.rsc)(?:/)?$',
                  destination:
                    '/catch/[...segments].segments/catch/$c$segments$segment?nxtPsegments=$nxtPsegments',
                  routeKeys: {
                    nxtPsegments: 'nxtPsegments',
                  },
                },
              ],
            },
          ],
          dataRoutes: [
            {
              page: '/catch/[...segments]',
              dataRouteRegex:
                '^/_next/data/buildId/catch/(?<nxtPsegments>.+?)\\.json$',
              namedDataRouteRegex:
                '^/_next/data/buildId/catch/(?<nxtPsegments>.+?)\\.json$',
              routeKeys: {
                nxtPsegments: 'nxtPsegments',
              },
            },
          ],
        },
        null,
        2
      ),
    });

    try {
      const routesManifest = await getRoutesManifest(
        entryPath,
        '.next',
        '15.0.0'
      );

      expect(routesManifest).toBeDefined();
      const dynamicRoute = routesManifest!.dynamicRoutes[0] as any;
      const prefetchSegmentDataRoute =
        dynamicRoute.prefetchSegmentDataRoutes[0];
      const dataRoute = routesManifest!.dataRoutes![0];

      expect(dynamicRoute.routeKeys).toEqual({
        nxtPsegments: 'nxtPsegments',
      });
      expect(dynamicRoute.regex).toContain('(?<nxtPsegments>');
      expect(dynamicRoute.namedRegex).toContain('(?<nxtPsegments>');

      expect(prefetchSegmentDataRoute.routeKeys).toEqual({
        nxtPsegments: 'nxtPsegments',
      });
      expect(prefetchSegmentDataRoute.source).toContain('(?<nxtPsegments>');
      expect(prefetchSegmentDataRoute.destination).toContain(
        'nxtPsegments=$nxtPsegments'
      );

      expect(dataRoute.routeKeys).toEqual({
        nxtPsegments: 'nxtPsegments',
      });
      expect(dataRoute.dataRouteRegex).toContain('(?<nxtPsegments>');
      expect(dataRoute.namedDataRouteRegex).toContain('(?<nxtPsegments>');
    } finally {
      await fs.remove(entryPath);
    }
  });

  it('does not normalize non-reserved route keys', async () => {
    const entryPath = await genDir({
      '.next/routes-manifest.json': JSON.stringify(
        {
          version: 4,
          pages404: true,
          basePath: '',
          redirects: [],
          rewrites: {
            beforeFiles: [],
            afterFiles: [],
            fallback: [],
          },
          staticRoutes: [],
          dynamicRoutes: [
            {
              page: '/blog/[slug]',
              regex: '^/blog/(?<nxtPslug>.+?)(?:/)?$',
              namedRegex: '^/blog/(?<nxtPslug>.+?)(?:/)?$',
              routeKeys: {
                nxtPslug: 'nxtPslug',
              },
            },
          ],
        },
        null,
        2
      ),
    });

    try {
      const routesManifest = await getRoutesManifest(
        entryPath,
        '.next',
        '15.0.0'
      );

      expect(routesManifest).toBeDefined();
      const dynamicRoute = routesManifest!.dynamicRoutes[0] as any;
      expect(dynamicRoute.routeKeys).toEqual({
        nxtPslug: 'nxtPslug',
      });
      expect(dynamicRoute.regex).toContain('(?<nxtPslug>');
      expect(dynamicRoute.namedRegex).toContain('(?<nxtPslug>');
    } finally {
      await fs.remove(entryPath);
    }
  });
});
