import type { MatcherState } from '@vitest/expect';
import { expect } from 'vitest';
import type { TelemetryEventStore } from '../../../src/util/telemetry';

interface EventData {
  key: string;
  value: string;
}

export function toHaveTelemetryEvents(
  this: MatcherState,
  received: TelemetryEventStore,
  expected: EventData[]
) {
  // define Todo object structure with objectContaining
  const expectEventObject = (event?: EventData) =>
    expect.objectContaining({
      id: expect.any(String),
      sessionId: expect.any(String),
      key: event?.key,
      value: event?.value,
    });

  // define Todo array with arrayContaining and re-use expectTodoObject
  const expectEventsArray = (events: Array<EventData>) =>
    events.length === 0
      ? // in case an empty array is passed
        expect.arrayContaining([expectEventObject()])
      : // in case an array of Todos is passed
        expect.arrayContaining(events.map(expectEventObject));

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
      `Expected: ${this.utils.printExpected(expectedResult)}\nReceived: ${this.utils.printReceived(
        received
      )}\n\n${this.utils.diff(expectedResult, received.readonlyEvents)}`,
    pass,
  };
}
