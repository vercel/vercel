import type { Express } from 'express';
import { pathToRegexp } from 'path-to-regexp';

let app: Express | null = null;

export const handle = (expressModule: any) => {
  if (typeof expressModule === 'function') {
    const originalCreateApp = expressModule;
    const createApp = (...args: any[]) => {
      const newApp = originalCreateApp(...args);
      app = newApp;
      return newApp;
    };
    return createApp;
  }
  return expressModule;
};

process.on('beforeExit', () => {
  if (app) {
    const routes = extractRoutes(app);
    console.log(JSON.stringify({ routes }));
  }
});

const extractRoutes = (app: Express) => {
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
  if (!app) {
    return;
  }
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
