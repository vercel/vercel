import { expect } from 'vitest';
import type { ToHaveTelemetryEventsMatchers } from './to-have-telemetry-events';
import { toHaveTelemetryEvents } from './to-have-telemetry-events';
import type { ToOutputMatchers } from './to-output';
import { toOutput } from './to-output';

declare module 'vitest' {
  interface Assertion<T = any>
    extends ToOutputMatchers<T>,
      ToHaveTelemetryEventsMatchers<T> {}
}

expect.extend({ toOutput, toHaveTelemetryEvents });
