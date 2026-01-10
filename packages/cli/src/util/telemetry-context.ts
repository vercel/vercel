import { randomUUID } from 'node:crypto';
import type { TelemetryEventStore } from './telemetry';

interface TelemetryContext {
  command: string;
  store: TelemetryEventStore;
}

let currentContext: TelemetryContext | null = null;

export function setTelemetryContext(
  command: string,
  store: TelemetryEventStore
) {
  currentContext = { command, store };
}

export function clearTelemetryContext() {
  currentContext = null;
}

export function trackArgumentError(error: string) {
  if (currentContext) {
    currentContext.store.add({
      id: randomUUID(),
      eventTime: Date.now(),
      key: `error:argument_error:${currentContext.command}`,
      value: error,
    });
  }
}
