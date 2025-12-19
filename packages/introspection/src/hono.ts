import type { Hono } from 'hono';
import { pathToRegexp } from 'path-to-regexp';
import { setupCloseHandlers } from './util.js';
import { debug } from '@vercel/build-utils';

const apps: Hono[] = [];

export const handle = (honoModule: any) => {
  const TrackedHono = class extends honoModule.Hono {
    constructor(...args: any[]) {
      super(...args);

      apps.push(this as unknown as Hono);
    }
  };
  return TrackedHono;
};

setupCloseHandlers(() => {
  const routes = extractRoutes();
  if (routes.length > 0) {
    return { frameworkSlug: 'hono', routes };
  }
  return undefined;
});

function extractRoutes() {
  // get the app that has the most routes
  const app = apps.sort((a, b) => b.routes.length - a.routes.length)[0];
  if (!app || !app.routes) {
    return [];
  }
  const routes: { src: string; dest: string; methods: string[] }[] = [];

  for (const route of app.routes) {
    const routePath = route.path;
    const method = route.method.toUpperCase();
    try {
      const { regexp } = pathToRegexp(routePath);

      if (routePath === '/') {
        continue;
      }

      routes.push({
        src: regexp.source,
        dest: routePath,
        methods: [method],
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      debug(`Error extracting routes for ${routePath}: ${message}`);
      //
    }
  }
  return routes;
}
