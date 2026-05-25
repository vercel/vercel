import type { Lambda } from '../lambda';

interface PrerenderLike {
  lambda?: Lambda;
}

export function validatePrerender(
  prerender: PrerenderLike
): asserts prerender is { lambda: Lambda } {
  if (typeof prerender.lambda === 'undefined') {
    throw new Error(`Prerender "buildResult" is missing "lambda" property`);
  }
}
