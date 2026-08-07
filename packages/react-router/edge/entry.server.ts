import { isbot } from 'isbot';
import { createElement } from 'react';
import {
  renderToReadableStream,
  type RenderToReadableStreamOptions,
  type RenderToPipeableStreamOptions,
} from 'react-dom/server';
import { ServerRouter } from 'react-router';
import type { AppLoadContext, EntryContext } from 'react-router';

export type RenderOptions = {
  [K in keyof RenderToReadableStreamOptions &
    keyof RenderToPipeableStreamOptions]?: RenderToReadableStreamOptions[K];
};

const vercelDeploymentId = process.env.VERCEL_DEPLOYMENT_ID;
const vercelSkewProtectionEnabled =
  process.env.VERCEL_SKEW_PROTECTION_ENABLED === '1';

type AssetsManifest = EntryContext['manifest'];

/**
 * Appends `?dpl=<deploymentId>` to an asset URL so Vercel's edge can route
 * the request to the deployment that produced the asset, preventing 404s
 * when a cached HTML page references assets from a previous deployment.
 */
function appendDpl(url: string, deploymentId: string): string {
  if (!url || url.includes('?dpl=') || url.includes('&dpl=')) {
    return url;
  }
  return url.includes('?')
    ? `${url}&dpl=${deploymentId}`
    : `${url}?dpl=${deploymentId}`;
}

/**
 * Returns a new `AssetsManifest` where every script module URL, import URL,
 * CSS URL, and the manifest's own URL have `?dpl=<deploymentId>` appended.
 *
 * This ensures that `<Scripts>` and `<Links>` emitted by `<ServerRouter>` all
 * carry the deployment ID, allowing Vercel's Skew Protection to serve them
 * from the correct deployment without requiring a `Set-Cookie: __vdpl=…`
 * header on the SSR response (which would otherwise prevent CDN caching of
 * the page). Note: fog-of-war (lazy route discovery) requests are separate
 * HTTP fetches and are not covered by pinning `manifest.url` here.
 */
function pinManifestAssets(
  manifest: AssetsManifest,
  deploymentId: string
): AssetsManifest {
  const pin = (url: string) => appendDpl(url, deploymentId);
  return {
    ...manifest,
    entry: {
      ...manifest.entry,
      module: pin(manifest.entry.module),
      imports: manifest.entry.imports.map(pin),
    },
    routes: Object.fromEntries(
      Object.entries(manifest.routes).map(([id, route]) => [
        id,
        route
          ? {
              ...route,
              module: pin(route.module),
              imports: route.imports?.map(pin),
              css: route.css?.map(pin),
            }
          : route,
      ])
    ) as AssetsManifest['routes'],
    // Pin the manifest's own resource URL for skew protection
    url: pin(manifest.url),
  };
}

export async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext?: AppLoadContext,
  options?: RenderOptions
): Promise<Response> {
  // When Vercel Skew Protection is enabled, pin all asset URLs in the
  // manifest to the current deployment via `?dpl=<deploymentId>`.  This
  // allows the SSR response to remain CDN-cacheable (no Set-Cookie header)
  // while still ensuring that stale HTML pages can resolve their assets
  // against the deployment they were generated from.
  const effectiveContext =
    vercelSkewProtectionEnabled && vercelDeploymentId
      ? {
          ...routerContext,
          manifest: pinManifestAssets(
            routerContext.manifest,
            vercelDeploymentId
          ),
        }
      : routerContext;

  const body = await renderToReadableStream(
    createElement(ServerRouter, {
      context: effectiveContext,
      url: request.url,
      nonce: options?.nonce,
    }),
    {
      ...options,
      signal: request.signal,
      onError(error) {
        console.error(error);
        responseStatusCode = 500;
      },
    }
  );

  if (isbot(request.headers.get('user-agent'))) {
    await body.allReady;
  }

  responseHeaders.set('Content-Type', 'text/html');

  return new Response(body as any, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
