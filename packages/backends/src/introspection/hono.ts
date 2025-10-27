import type { Hono } from 'hono';
import { pathToRegexp } from 'path-to-regexp';
import { setupCloseHandlers } from './util.js';

let app: Hono | null = null;

export const handle = (honoModule: any) => {
  const TrackedHono = class extends honoModule.Hono {
    constructor(...args: any[]) {
      super(...args);

      // eslint-disable-next-line
      app = this as unknown as Hono;
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
  if (!app || !app.routes) {
    return [];
  }
  const routes: { src: string; dest: string; methods: string[] }[] = [];

  for (const route of app.routes) {
    const routePath = route.path;
    const method = route.method.toUpperCase();
    const { regexp } = pathToRegexp(routePath);

    if (routePath === '/') {
      continue;
    }

    routes.push({
      src: regexp.source,
      dest: routePath,
      methods: [method],
    });
  }
  return routes;
}
