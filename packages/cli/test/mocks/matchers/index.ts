import { expect } from 'vitest';
import { toOutput } from './matchers';

interface ToOutputMatchers<R = unknown> {
  toOutput: (test: string, timeout?: number) => Promise<R>;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Assertion<T = any> extends ToOutputMatchers<T> {}
}

expect.extend({ toOutput });
