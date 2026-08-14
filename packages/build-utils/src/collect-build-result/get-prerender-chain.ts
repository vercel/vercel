import type { Chain } from '../types';
import type { Prerender } from '../prerender';

/**
 * The Prerender chain can be defined as a `chain` property or as a flag
 * `experimentalStreamingLambdaPath`. This function normalizes the chain
 * to a single structure.
 */
export function getPrerenderChain(prerender: Prerender): Chain | undefined {
  if (prerender.chain) {
    return {
      outputPath: prerender.chain.outputPath,
      headers: prerender.chain.headers,
    };
  }

  if (prerender.experimentalStreamingLambdaPath) {
    return {
      outputPath: prerender.experimentalStreamingLambdaPath,
      headers: {
        'x-matched-path': prerender.experimentalStreamingLambdaPath,
      },
    };
  }

  return undefined;
}
