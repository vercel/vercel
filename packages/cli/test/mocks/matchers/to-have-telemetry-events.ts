import type { MatcherState } from '@vitest/expect';
import { expect } from 'vitest';
import type { TelemetryEventStore } from '../../../src/util/telemetry';

interface EventData {
  key: string;
  value: string;
}

export interface ToHaveTelemetryEventsMatchers<R = unknown> {
  toHaveTelemetryEvents: (test: EventData[], timeout?: number) => Promise<R>;
}

export function toHaveTelemetryEvents(
  this: MatcherState,
  received: TelemetryEventStore,
  expected: EventData[]
) {
  const expectEventsArray = (events: Array<EventData>) => {
    const [firstEvent] = received.readonlyEvents;
    if (events.length === 0) {
      return expect.arrayContaining([]);
    } else {
      const expectCommonSessionEventObject = (event?: EventData) =>
        expect.objectContaining({
          id: expect.any(String),
          sessionId: firstEvent?.sessionId,
          key: event?.key,
          value: event?.value,
        });
      return expect.arrayContaining(events.map(expectCommonSessionEventObject));
    }
  };

  // expected can either be an array or an object
  const expectedResult = expectEventsArray(expected);

  // equality check for received todo and expected todo
  const pass = this.equals(received.readonlyEvents, expectedResult);

  if (pass) {
    return {
      message: () =>
        `Expected: ${this.utils.printExpected(expectedResult)}\nReceived: ${this.utils.printReceived(received.readonlyEvents)}`,
      pass,
    };
  }
  return {
    message: () =>
      `\n${this.utils.diff(expectedResult, received.readonlyEvents)}`,
    pass,
  };
}
