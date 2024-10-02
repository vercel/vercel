import { expect } from 'vitest';
import {
  toHaveTelemetryEvents,
  ToHaveTelemetryEventsMatchers,
} from './to-have-telemetry-events';
import { toOutput, ToOutputMatchers } from './to-output';

declare module 'vitest' {
  interface Assertion<T = any>
    extends ToOutputMatchers<T>,
      ToHaveTelemetryEventsMatchers<T> {}
}

expect.extend({ toOutput, toHaveTelemetryEvents });
