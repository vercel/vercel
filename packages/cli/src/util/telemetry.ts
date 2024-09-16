import { randomUUID } from 'node:crypto';

import type { Output } from './output';

interface Args {
  // api: string;
  // packageInfo: PackageInfo;
  // config: TelemetryConfig;
  opts: Options;
}

interface Options {
  output: Output;
  timeout?: number;
  batchSize?: number;
  isDebug: boolean;
}

interface Event {
  id: string;
  key: string;
  value: string;
}

export class TelemetryClient {
  private output: Output;
  private isDebug: boolean;
  private events: Event[];

  constructor({ opts }: Args) {
    this.output = opts.output;
    this.isDebug = opts.isDebug;
    this.events = [];
  }

  private track(key: string, value: string) {
    if (this.isDebug) {
      this.output.debug(`['telemetry']: ${key}:${value}`);
    }

    const event: Event = {
      id: randomUUID(),
      key,
      value,
    };

    this.events.push(event);
  }

  protected trackCliCommand(command: string, value: string) {
    this.track(`command:${command}`, value);
  }

  protected trackCliSubcommand(subcommand: string, value: string) {
    this.track(`subcommand:${subcommand}`, value);
  }

  protected trackCliArgument(arg: string, value: string | undefined) {
    if (value) {
      this.track(`argument:${arg}`, value);
    }
  }

  protected trackCliOption(flag: string, value: string) {
    this.track(`flag:${flag}`, value);
  }

  protected trackCliFlag(flag: string, passed: boolean | undefined) {
    if (passed) {
      this.track(`flag:${flag}`, String(passed));
    }
  }

  trackCommandError(error: string): Event | undefined {
    this.output.error(error);
    return;
  }

  trackFlagHelp() {
    this.trackCliOption('help', '');
  }

  close() {
    this.flushEvents();
  }

  private flushEvents() {
    if (this.isDebug) {
      this.output.debug('Flushing Events, hypothetically');
      this.events.forEach(event => {
        this.output.debug(JSON.stringify(event));
      });
    }
  }
}
