import type { Express } from 'express';
import { pathToRegexp } from 'path-to-regexp';
import { setupCloseHandlers } from './util.js';

let app: Express | null = null;

export const handle = (expressModule: any) => {
  if (typeof expressModule === 'function') {
    const originalCreateApp = expressModule;
    const createApp = (...args: any[]) => {
      app = originalCreateApp(...args);
      return app;
    };

    // Copy all static properties from original express (e.g., .static, .Router, etc.)
    Object.setPrototypeOf(createApp, originalCreateApp);
    Object.assign(createApp, originalCreateApp);

    return createApp;
  }
  return expressModule;
};

setupCloseHandlers(() => {
  const { routes, additionalFolders, additionalDeps } = extractRoutes();
  if (routes.length > 0) {
    return {
      frameworkSlug: 'express',
      routes,
      additionalFolders,
      additionalDeps,
    };
  }
  return undefined;
});

const extractRoutes = () => {
  if (!app) {
    return { routes: [], additionalFolders: [], additionalDeps: [] };
  }
  const additionalFolders: string[] = [];
  const additionalDeps: string[] = [];
  const routes: { src: string; dest: string; methods: string[] }[] = [];
  const methods = [
    'all',
    'get',
    'post',
    'put',
    'delete',
    'patch',
    'options',
    'head',
  ];
  const router = app._router || app.router;
  if ('settings' in app) {
    if ('views' in app.settings && typeof app.settings.views === 'string') {
      additionalFolders.push(app.settings.views as string);
    }
    if (
      'view engine' in app.settings &&
      typeof app.settings['view engine'] === 'string'
    ) {
      additionalDeps.push(app.settings['view engine'] as string);
    }
  }
  for (const route of router.stack) {
    if (route.route) {
      const m = [];
      for (const method of methods) {
        if (route.route.methods[method]) {
          m.push(method.toUpperCase());
        }
      }
      const { regexp } = pathToRegexp(route.route.path);

      if (route.route.path === '/') {
        continue;
      }

      routes.push({
        src: regexp.source,
        dest: route.route.path,
        methods: m,
      });
    }
  }
  return { routes, additionalFolders, additionalDeps };
};
