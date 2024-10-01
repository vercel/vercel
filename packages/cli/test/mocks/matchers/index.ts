import { expect } from 'vitest';
import {
  toOutput,
  ToOutputMatchers,
  toHaveTelemetryEvents,
  ToHaveTelemetryEventsMatchers,
} from './matchers';

declare module 'vitest' {
  // https://vitest.dev/guide/extending-matchers#extending-matchers
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Assertion<T = any> extends ToOutputMatchers<T> {}
  // https://vitest.dev/guide/extending-matchers#extending-matchers
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Assertion<T = any> extends ToHaveTelemetryEventsMatchers<T> {}
}

expect.extend({ toOutput, toHaveTelemetryEvents });
