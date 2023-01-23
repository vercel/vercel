import type { BuildDependencies } from '@edge-runtime/node-utils';
import { buildToNodeHandler } from '@edge-runtime/node-utils';

export function transformToNodeHandler(webHandler: any) {
  const toNodeHandler = buildToNodeHandler(
    globalThis as unknown as BuildDependencies,
    { origin: 'http://example.com' } // TODO shouldn't the origin be set per-request at run time?
  );
  return toNodeHandler(webHandler);
}
