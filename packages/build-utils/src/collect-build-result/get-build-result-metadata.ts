import type { Route } from '@vercel/routing-utils';
import type { EdgeFunction } from '../edge-function';
import type { File } from '../types';
import type { Lambda } from '../lambda';
import type { Prerender } from '../prerender';
import { NowBuildError } from '../errors';
import { getLambdaByOutputPath } from './get-lambda-by-output-path';
import { getPrerenderChain } from './get-prerender-chain';
import { isRouteMiddleware } from './is-route-middleware';

export interface BuildResultMetadata {
  middleware: Map<string, MiddlewareMeta>;
  ppr: Map<string, boolean>;
}

/**
 * Extract metadata about the build result that depend on the relationship
 * between components in the build output. This data is later used to map to
 * the infrastructure that we need to create.
 */
export function getBuildResultMetadata(params: {
  buildOutputMap: Record<string, EdgeFunction | Lambda | Prerender | File>;
  routes: Route[];
}): BuildResultMetadata {
  return {
    middleware: getMiddlewareMetadata(params),
    ppr: new Map(
      Object.entries(params.buildOutputMap).flatMap(([_outputPath, output]) => {
        if (output.type === 'Prerender') {
          const chain = getPrerenderChain(output);
          if (chain) {
            const maybeLambda = getLambdaByOutputPath({
              buildOutputMap: params.buildOutputMap,
              outputPath: chain.outputPath,
            });

            if (maybeLambda) {
              return [[chain.outputPath, true]];
            }
          }
        }

        return [];
      })
    ),
  };
}

type MiddlewareMeta =
  | {
      type: 'middleware';
      middlewarePath: string;
      outputPath: string;
      match: Set<string>;
      edgeFunction: EdgeFunction;
      index: number;
    }
  | {
      type: 'middleware-lambda';
      middlewarePath: string;
      outputPath: string;
      match: Set<string>;
      index: number;
    };

function getMiddlewareMetadata(params: {
  buildOutputMap: Record<string, EdgeFunction | Lambda | Prerender | File>;
  routes: Route[];
}): Map<string, MiddlewareMeta> {
  const deduped = new Map(
    params.routes.filter(isRouteMiddleware).map(route =>
      toMiddlewareTuple({
        buildOutputMap: params.buildOutputMap,
        middlewarePath: route.middlewarePath,
      })
    )
  );

  return new Map(
    Array.from(deduped, ([outputPath, metadata], index) => [
      outputPath,
      { ...metadata, index },
    ])
  );
}

function toMiddlewareTuple(params: {
  middlewarePath: string;
  buildOutputMap: Record<string, EdgeFunction | Lambda | Prerender | File>;
}) {
  const keys = [
    params.middlewarePath,
    params.middlewarePath.replace(/^\//, ''),
  ];

  const [outputPath, output] =
    Object.entries(params.buildOutputMap).find(
      (entry): entry is [string, EdgeFunction | Lambda] =>
        keys.includes(entry[0]) &&
        (entry[1].type === 'EdgeFunction' || entry[1].type === 'Lambda')
    ) ?? [];

  if (!outputPath || !output) {
    throw new NowBuildError({
      message: `Mapping ${params.middlewarePath} not found. Maybe you provided a wrong middlewarePath?`,
      code: 'middleware_path_not_found',
    });
  }

  return [
    outputPath,
    output.type === 'EdgeFunction'
      ? {
          edgeFunction: output,
          match: new Set<string>(keys),
          middlewarePath: params.middlewarePath,
          outputPath,
          type: 'middleware' as const,
        }
      : {
          match: new Set<string>(keys),
          middlewarePath: params.middlewarePath,
          outputPath,
          type: 'middleware-lambda' as const,
        },
  ] as const;
}
