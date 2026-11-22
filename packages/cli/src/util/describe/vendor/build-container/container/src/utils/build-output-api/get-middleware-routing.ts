// Vendored from vercel/api.
// See packages/cli/src/util/describe/vendor/README.md before editing.

import type { FunctionOutputs } from './functions/read-functions';
import type { Route } from '@vercel/routing-utils';
import { NowBuildError, type EdgeFunction } from '@vercel/build-utils';
import { isRouteMiddleware } from './is-route-middleware';

type MiddlewareRouting =
  | {
      type: 'middleware';
      middlewarePath: string;
      outputPath: string;
      edgeFunction: EdgeFunction;
      index: number;
    }
  | {
      type: 'middleware-lambda';
      middlewarePath: string;
      outputPath: string;
      index: number;
    };

const cache = new WeakMap<
  FunctionOutputs,
  { routes: Route[]; routing: Map<string, MiddlewareRouting> }
>();

export function getMiddlewareRouting(buildResult: {
  functions: FunctionOutputs;
  routes: Route[];
}): Map<string, MiddlewareRouting> {
  const cached = cache.get(buildResult.functions);
  if (cached && cached.routes === buildResult.routes) {
    return cached.routing;
  }

  const routing = new Map<string, MiddlewareRouting>();
  const { lambdas, edgeFunctions } = buildResult.functions;
  for (const route of buildResult.routes) {
    if (!isRouteMiddleware(route)) continue;
    let outputPath = route.middlewarePath;
    if (!lambdas.has(outputPath) && !edgeFunctions.has(outputPath)) {
      outputPath = outputPath.replace(/^\//, '');
    }

    const output = lambdas.get(outputPath) ?? edgeFunctions.get(outputPath);
    if (!outputPath || !output) {
      throw new NowBuildError({
        message: `Mapping ${route.middlewarePath} not found. Maybe you provided a wrong middlewarePath?`,
        code: 'middleware_path_not_found',
      });
    }

    const index = routing.get(outputPath)?.index ?? routing.size;
    routing.set(
      outputPath,
      output.type === 'EdgeFunction'
        ? {
            type: 'middleware',
            middlewarePath: route.middlewarePath,
            outputPath,
            edgeFunction: output,
            index,
          }
        : {
            type: 'middleware-lambda',
            middlewarePath: route.middlewarePath,
            outputPath,
            index,
          }
    );
  }
  cache.set(buildResult.functions, { routes: buildResult.routes, routing });
  return routing;
}
