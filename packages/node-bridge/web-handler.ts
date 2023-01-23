import type { BuildDependencies } from '@edge-runtime/node-utils';
import { buildToNodeHandler } from '@edge-runtime/node-utils';

export function transformToNodeHandler(webHandler: any, runtime: string) {
  const nodeVersion = parseInt(runtime.replace(/^nodejs/, ''));
  if (isNaN(nodeVersion) || nodeVersion < 18) {
    throw new Error(
      `web compliant signature can only be used with node.js 18 and later. Please configure your function's runtime accordingly`
    );
  }
  // TODO throw when runtime isn't Node18
  const toNodeHandler = buildToNodeHandler(
    globalThis as unknown as BuildDependencies,
    { origin: 'http://example.com' } // TODO shouldn't the origin be set per-request at run time?
  );
  return toNodeHandler(webHandler);
}
