// Vendored from vercel/api.
// See packages/cli/src/util/describe/vendor/README.md before editing.

import type { FunctionOutputs } from './functions/read-functions';
import type { Lambda, Prerender } from '@vercel/build-utils';

interface NativeFunctionOutput {
  lambda: Lambda;
  path: string;
  prerender: (Prerender & { lambda: Lambda }) | undefined;
}

export function* iterateNativeFunctionOutputs(
  functions: Pick<FunctionOutputs, 'lambdas' | 'prerenders'>
): IterableIterator<NativeFunctionOutput> {
  for (const outputs of [functions.lambdas, functions.prerenders]) {
    for (const [path, output] of outputs) {
      yield {
        path,
        lambda: output.type === 'Lambda' ? output : output.lambda,
        prerender: output.type === 'Prerender' ? output : undefined,
      };
    }
  }
}
