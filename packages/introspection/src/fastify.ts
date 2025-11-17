import type { FastifyInstance } from 'fastify';
import { setupCloseHandlers } from './util.js';
import type { Instance } from 'find-my-way';
import { pathToRegexp } from 'path-to-regexp';

let app: FastifyInstance | null = null;
const findMyWays: Instance<any>[] = [];

export const handle = (mod: any) => {
  if (typeof mod === 'function') {
    const originalCreateApp = mod;
    const createApp = (...args: any[]) => {
      app = originalCreateApp(...args);
      (globalThis as any).fastifyApp = app;
      return app;
    };

    // Copy all static properties from original express (e.g., .static, .Router, etc.)
    Object.setPrototypeOf(createApp, originalCreateApp);
    Object.assign(createApp, originalCreateApp);

    return createApp;
  }
  return mod;
};

setupCloseHandlers(() => {
  const routes = extractRoutes();
  if (routes.length > 0) {
    return { frameworkSlug: 'hono', routes };
  }
  return undefined;
});

function extractRoutes() {
  if (findMyWays.length > 0) {
    const routes: { src: string; dest: string; methods: string[] }[] = [];
    const router = findMyWays.find(
      f => f.prettyPrint() === (globalThis as any).fastifyApp.printRoutes()
    );
    if (router) {
      // @ts-ignore routes not exposed as a type, but is documented https://github.com/delvedor/find-my-way#routes
      for (const route of router.routes) {
        const { regexp } = pathToRegexp(route.path);

        if (route.path === '/') {
          continue;
        }
        const existingRoute = routes.find(r => r.dest === route.path);
        if (existingRoute) {
          existingRoute.methods.push(route.method.toUpperCase());
        } else {
          routes.push({
            src: regexp.source,
            dest: route.path,
            methods: [route.method.toUpperCase()],
          });
        }
      }
      return routes;
    }
  }
  return [];
}

export const handleFindMyWay = (mod: any) => {
  const originalCreate = mod;
  const create = (...args: any[]) => {
    findMyWays.push(originalCreate(...args));
    return findMyWays[findMyWays.length - 1];
  };
  return create;
};
