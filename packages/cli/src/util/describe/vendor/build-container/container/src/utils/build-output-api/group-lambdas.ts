// Vendored from vercel/api.
// See packages/cli/src/util/describe/vendor/README.md before editing.

import type { FunctionOutputs } from './functions/read-functions';
import type { Lambda } from '@vercel/build-utils';
import { groupLambdas } from '../../../../../packages/group-lambdas/src/group-lambdas';

export async function groupBundleableLambdas(params: {
  functions: FunctionOutputs;
  options: { debugGroupLambdas?: boolean; maxBundleSizeMb?: number };
}) {
  const lambdas: Record<string, Lambda> = {};
  for (const [path, lambda] of params.functions.lambdas) {
    if (lambda.experimentalAllowBundling) {
      lambdas[path] = lambda;
    }
  }

  for (const [path, prerender] of params.functions.prerenders) {
    if (prerender.lambda.experimentalAllowBundling) {
      lambdas[path] = prerender.lambda;
    }
  }

  if (Object.keys(lambdas).length === 0) {
    return;
  }

  const grouped = await groupLambdas(lambdas, {
    force: undefined,
    maxBundleSizeMb: params.options.maxBundleSizeMb,
    debug: params.options.debugGroupLambdas,
  });

  for (const [path, lambda] of Object.entries(grouped)) {
    if (params.functions.lambdas.has(path)) {
      params.functions.lambdas.set(path, lambda);
    } else {
      const prerender = params.functions.prerenders.get(path);
      if (prerender) {
        prerender.lambda = lambda;
      } else {
        throw new Error(
          `Grouped lambda "${path}" does not match any build output`
        );
      }
    }
  }
}
