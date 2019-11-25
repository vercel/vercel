import { Route, MergeRoutesProps } from './types';
import { isHandler } from './index';

interface BuilderToRoute {
  [use: string]: Route[];
}

interface BuilderRoutes {
  [entrypoint: string]: BuilderToRoute;
}

export function mergeRoutes({ userRoutes, builds }: MergeRoutesProps): Route[] {
  const outputRoutes = (userRoutes || []).slice(0); // shallow clone
  const builderRoutes: BuilderRoutes = {};
  const sortedBuilderRoutes: Route[] = [];
  const afterFilesystemBuilderRoutes: Route[] = [];
  let handleFilesystem = false;

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
      let normalRoute = true;
      br[use].forEach(route => {
        if (normalRoute) {
          if (isHandler(route) && route.handle === 'filesystem') {
            normalRoute = false;
          } else {
            sortedBuilderRoutes.push(route);
          }
        } else {
          afterFilesystemBuilderRoutes.push(route);
        }
      });
    });
  });

  // If the user routes specify a handle: 'filesystem', inject
  // the sortedBuilderRoutes right before it.
  // FYI: outputRoutes already contains all user routes
  outputRoutes.some((r, i) => {
    if (!handleFilesystem && isHandler(r) && r.handle === 'filesystem') {
      handleFilesystem = true;
      outputRoutes.splice(i, 0, ...sortedBuilderRoutes);
    }
    return handleFilesystem;
  });

  // If the user's routes did not specify handle: 'filesystem',
  // push the sortedBuilderRoutes to the end of the user routes.
  if (!handleFilesystem) {
    outputRoutes.push(...sortedBuilderRoutes);

    // We only want to inject { handle: 'filesystem' } if it
    // was defined by builder routes.
    if (afterFilesystemBuilderRoutes.length > 0) {
      outputRoutes.push({ handle: 'filesystem' });
    }
  }
  // Finally, push the routes that should appear after handle:
  // 'filesystem' -- these will be after all user defined routes.
  outputRoutes.push(...afterFilesystemBuilderRoutes);
  return outputRoutes;
}
