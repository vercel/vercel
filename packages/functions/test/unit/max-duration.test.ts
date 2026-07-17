import { afterEach, describe, expect, it } from 'vitest';

import { SYMBOL_FOR_REQ_CONTEXT } from '../../src/get-context';
import { getMaxDuration } from '../../src/max-duration';

function setContext(context: Record<string, unknown>) {
  globalThis[SYMBOL_FOR_REQ_CONTEXT] = {
    get: () => context,
  };
}

describe('getMaxDuration', () => {
  afterEach(() => {
    delete globalThis[SYMBOL_FOR_REQ_CONTEXT];
  });

  it('returns maxDuration from request context', () => {
    setContext({ maxDuration: 800 });
    expect(getMaxDuration()).toBe(800);
  });

  it('returns undefined when no runtime data is available', () => {
    setContext({});
    expect(getMaxDuration()).toBeUndefined();
  });
});
