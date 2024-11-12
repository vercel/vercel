import { expect } from 'vitest';
import {
  ToHaveFetchBody,
  toHaveFetchBody,
  toHaveTelemetryEvents,
  ToHaveTelemetryEventsMatchers,
} from './to-have-telemetry-events';
import { toOutput, ToOutputMatchers } from './to-output';

declare module 'vitest' {
  interface Assertion<T = any>
    extends ToOutputMatchers<T>,
      ToHaveTelemetryEventsMatchers<T> {}

  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface AsymmetricMatchersContaining extends ToHaveFetchBody {}
}

// @ts-expect-error
expect.extend({ toOutput, toHaveTelemetryEvents, toHaveFetchBody });
