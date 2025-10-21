import type { Express } from 'express';
import { pathToRegexp } from 'path-to-regexp';

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
process.on('SIGINT', () => {
  extractMetadata();
});
process.on('SIGTERM', () => {
  extractMetadata();
});
process.on('exit', () => {
  extractMetadata();
});

const extractMetadata = () => {
  if (!app) {
    return;
  }
  const metadata = {
    routes: extractRoutes(),
  };
  console.log(JSON.stringify(metadata));
};

let isExtractingRoutes = false;

const extractRoutes = () => {
  if (isExtractingRoutes) {
    return;
  }
  if (!app) {
    return;
  }
  isExtractingRoutes = true;

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
  return routes;
};
