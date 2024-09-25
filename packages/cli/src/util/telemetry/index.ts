import { randomUUID } from 'node:crypto';
import type { Output } from '../output';

const LogLabel = `['telemetry']:`;

interface Args {
  opts: Options;
}

interface Options {
  output: Output;
  store: TelemetryEventStore;
  isDebug?: boolean;
}

interface Event {
  sessionId?: string;
  id: string;
  key: string;
  value: string;
}

export class TelemetryClient {
  private output: Output;
  private isDebug: boolean;
  store: TelemetryEventStore;

  protected redactedValue = '[REDACTED]';

  constructor({ opts }: Args) {
    this.output = opts.output;
    this.isDebug = opts.isDebug || false;
    this.store = opts.store;
  }

  private track(eventData: { key: string; value: string }) {
    if (this.isDebug) {
      this.output.debug(`${LogLabel} ${eventData.key}:${eventData.value}`);
    }

    const event: Event = {
      id: randomUUID(),
      ...eventData,
    };

    this.store.add(event);
  }

  protected trackCliCommand(eventData: { command: string; value: string }) {
    this.track({
      key: `command:${eventData.command}`,
      value: eventData.value,
    });
  }

  protected trackCliSubcommand(eventData: {
    subcommand: string;
    value: string;
  }) {
    this.track({
      key: `subcommand:${eventData.subcommand}`,
      value: eventData.value,
    });
  }

  protected trackCliArgument(eventData: {
    arg: string;
    value: string | undefined;
  }) {
    if (eventData.value) {
      this.track({
        key: `argument:${eventData.arg}`,
        value: eventData.value,
      });
    }
  }

  protected trackCliOption(eventData: { flag: string; value: string }) {
    this.track({
      key: `flag:${eventData.flag}`,
      value: eventData.value,
    });
  }

  protected trackCliFlag(flag: string) {
    this.track({
      key: `flag:${flag}`,
      value: 'TRUE',
    });
  }

  trackCommandError(error: string): Event | undefined {
    this.output.error(error);
    return;
  }

  trackFlagHelp() {
    this.trackCliFlag('help');
  }
}

export class TelemetryEventStore {
  private events: Event[];
  private output: Output;
  private isDebug: boolean;
  private sessionId: string;

  constructor(opts: { output: Output; isDebug?: boolean }) {
    this.isDebug = opts.isDebug || false;
    this.output = opts.output;
    this.sessionId = randomUUID();
    this.events = [];
  }

  add(event: Event) {
    event.sessionId = this.sessionId;
    this.events.push(event);
  }

  get readonlyEvents() {
    return Array.from(this.events);
  }

  reset() {
    this.events = [];
  }

  save() {
    if (this.isDebug) {
      this.output.debug(`${LogLabel} Flushing Events`);
      this.events.forEach(event => {
        this.output.debug(JSON.stringify(event));
      });
    }
  }
}
