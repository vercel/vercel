import type { EdgeFunction } from '../edge-function';
import type { File } from '../types';
import type { Lambda } from '../lambda';
import type { Prerender } from '../prerender';

/**
 * A Prerender can hold references to a Lambda or another Prerender when
 * using PPR. This function retrieves the Lambda or Prerender from the
 * build output map ensuring its type.
 */
export function getLambdaByOutputPath(params: {
  buildOutputMap: Record<string, EdgeFunction | Lambda | Prerender | File>;
  outputPath: string;
}): Lambda | undefined {
  const output = params.buildOutputMap[params.outputPath];
  return output?.type === 'Lambda'
    ? output
    : output?.type === 'Prerender'
      ? output.lambda
      : undefined;
}
