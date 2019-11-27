import { Route, MergeRoutesProps } from './types';
import { isHandler } from './index';

interface BuilderToRoute {
  [use: string]: Route[];
}

interface BuilderRoutes {
  [entrypoint: string]: BuilderToRoute;
}

function getCheckAndContinue(
  routes: Route[]
): { checks: Route[]; continues: Route[]; others: Route[] } {
  const checks: Route[] = [];
  const continues: Route[] = [];
  const others: Route[] = [];

  for (const route of routes) {
    if (isHandler(route)) {
      // Should never happen, only here to make TS happy
      others.push(route);
    } else if (route.check) {
      checks.push(route);
    } else if (route.continue) {
      continues.push(route);
    } else {
      others.push(route);
    }
  }
  return { checks, continues, others };
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

  const builderBefore = getCheckAndContinue(builderRoutesBefore);
  const builderAfter = getCheckAndContinue(builderRoutesAfter);

  const outputRoutes: Route[] = [];
  outputRoutes.push(...builderBefore.continues);
  outputRoutes.push(...usersRoutesBefore);
  outputRoutes.push(...builderBefore.checks);
  outputRoutes.push(...builderBefore.others);
  if (usersRoutesAfter.length > 0 || builderRoutesAfter.length > 0) {
    outputRoutes.push({ handle: 'filesystem' });
  }
  outputRoutes.push(...builderAfter.continues);
  outputRoutes.push(...usersRoutesAfter);
  outputRoutes.push(...builderAfter.checks);
  outputRoutes.push(...builderAfter.others);
  return outputRoutes;
}
