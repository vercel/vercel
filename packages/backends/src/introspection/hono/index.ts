import type { Hono } from 'hono';
import { pathToRegexp } from 'path-to-regexp';

let app: Hono | null = null;

export const extendHono = (honoModule: any) => {
  const TrackedHono = class extends honoModule {
    constructor(...args: any[]) {
      super(...args);

      // eslint-disable-next-line
      app = this as unknown as Hono;
    }
  };
  return TrackedHono;
};

process.on('beforeExit', () => {
  if (app) {
    const routes = extractRoutesFromApp(app);
    console.log(JSON.stringify({ routes }));
  }
});

function extractRoutesFromApp(app: Hono) {
  const routes: { src: string; dest: string; methods: string[] }[] = [];
  if (!app || !app.routes) {
    return [];
  }

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
