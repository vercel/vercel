import { Route, MergeRoutesProps } from './types';
import { isHandler } from './index';

interface BuilderToRoute {
  [use: string]: Route[];
}

interface BuilderRoutes {
  [entrypoint: string]: BuilderToRoute;
}

export function mergeRoutes({ userRoutes, builds }: MergeRoutesProps): Route[] {
  const usersRoutesBefore: Route[] = [];
  const usersRoutesAfter: Route[] = [];
  const builderRoutes: BuilderRoutes = {};
  const builderRoutesBefore: Route[] = [];
  const builderRoutesAfter: Route[] = [];

  let foundUserDefinedFilesystem = false;
  (userRoutes || []).forEach(route => {
    if (!foundUserDefinedFilesystem) {
      if (isHandler(route) && route.handle === 'filesystem') {
        foundUserDefinedFilesystem = true;
      } else {
        usersRoutesBefore.push(route);
      }
    } else {
      usersRoutesAfter.push(route);
    }
  });

  // Convert build results to object mapping
  for (const build of builds) {
    if (build.routes) {
      if (!builderRoutes[build.entrypoint]) {
        builderRoutes[build.entrypoint] = {};
      }

      builderRoutes[build.entrypoint][build.use] = build.routes.map(route => {
        //route.built = true; // TODO: is this necessary?
        return route;
      });
    }
  }

  const sortedPaths = Object.keys(builderRoutes).sort();
  sortedPaths.forEach(path => {
    const br = builderRoutes[path];
    const sortedBuilders = Object.keys(br).sort();
    sortedBuilders.forEach(use => {
      let isBefore = true;
      br[use].forEach(route => {
        if (isBefore) {
          if (isHandler(route) && route.handle === 'filesystem') {
            isBefore = false;
          } else {
            builderRoutesBefore.push(route);
          }
        } else {
          builderRoutesAfter.push(route);
        }
      });
    });
  });

  const outputRoutes: Route[] = [];
  outputRoutes.push(...usersRoutesBefore);
  outputRoutes.push(...builderRoutesBefore);
  if (usersRoutesAfter.length > 0 || builderRoutesAfter.length > 0) {
    outputRoutes.push({ handle: 'filesystem' });
  }
  outputRoutes.push(...usersRoutesAfter);
  outputRoutes.push(...builderRoutesAfter);
  return outputRoutes;
}
