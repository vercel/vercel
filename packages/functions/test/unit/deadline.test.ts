import { afterEach, describe, expect, it } from 'vitest';

import { SYMBOL_FOR_REQ_CONTEXT } from '../../src/get-context';
import { getDeadline } from '../../src/deadline';

function setContext(context: Record<string, unknown>) {
  globalThis[SYMBOL_FOR_REQ_CONTEXT] = {
    get: () => context,
  };
}

describe('getDeadline', () => {
  afterEach(() => {
    delete globalThis[SYMBOL_FOR_REQ_CONTEXT];
  });

  it('returns deadline from request context', () => {
    setContext({ deadline: '2026-07-20T12:00:00.000Z' });
    expect(getDeadline()).toEqual(new Date('2026-07-20T12:00:00.000Z'));
  });

  it('returns undefined when deadline is not a valid date', () => {
    setContext({ deadline: 'not a valid date' });
    expect(getDeadline()).toBeUndefined();
  });

  it('returns undefined when no runtime data is available', () => {
    setContext({});
    expect(getDeadline()).toBeUndefined();
  });
});
