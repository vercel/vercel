import { randomUUID } from 'node:crypto';
import type { Output } from '../output';
import os from 'node:os';
import { GlobalConfig } from '@vercel-internals/types';

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
  teamId?: string;
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
  protected redactedArgumentsLength = (args: string[]) => {
    if (args && args.length === 1) {
      return 'ONE';
    } else if (args.length > 1) {
      return 'MANY';
    }
    return 'NONE';
  };

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

  protected trackCliOption(eventData: { option: string; value: string }) {
    this.track({
      key: `option:${eventData.option}`,
      value: eventData.value,
    });
  }

  protected trackCliFlag(flag: string) {
    this.track({
      key: `flag:${flag}`,
      value: 'TRUE',
    });
  }

  protected trackCPUs() {
    this.track({
      key: 'cpu_count',
      value: String(os.cpus().length),
    });
  }

  protected trackPlatform() {
    this.track({
      key: 'platform',
      value: os.platform(),
    });
  }

  protected trackArch() {
    this.track({
      key: 'arch',
      value: os.arch(),
    });
  }

  protected trackCI(ciVendorName?: string) {
    if (ciVendorName) {
      this.track({
        key: 'ci',
        value: ciVendorName,
      });
    }
  }

  protected trackVersion(version?: string) {
    if (version) {
      this.track({
        key: 'version',
        value: version,
      });
    }
  }

  protected trackDefaultDeploy() {
    this.track({
      key: 'default-deploy',
      value: 'TRUE',
    });
  }

  protected trackExtension(extension: string) {
    this.track({
      key: 'extension',
      value: extension,
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
  private teamId: string = 'NO_TEAM_ID';
  private config: GlobalConfig['telemetry'];

  constructor(opts: {
    output: Output;
    isDebug?: boolean;
    config: GlobalConfig['telemetry'];
  }) {
    this.isDebug = opts.isDebug || false;
    this.output = opts.output;
    this.sessionId = randomUUID();
    this.events = [];
    this.config = opts.config;
  }

  add(event: Event) {
    event.sessionId = this.sessionId;
    event.teamId = this.teamId;
    this.events.push(event);
  }

  updateTeamId(teamId?: string) {
    if (teamId) {
      this.teamId = teamId;
    }
  }

  get readonlyEvents() {
    return Array.from(this.events);
  }

  reset() {
    this.events = [];
  }

  get enabled() {
    if (process.env.VERCEL_TELEMETRY_DISABLED) {
      return false;
    }

    return this.config?.enabled === false ? false : true;
  }

  async save() {
    if (this.isDebug) {
      // Intentionally not using `this.output.debug` as it will
      // not write to stderr unless it is run with `--debug`
      this.output.log(`${LogLabel} Flushing Events`);
      this.events.forEach(event => {
        this.output.log(JSON.stringify(event));
      });

      return;
    }

    if (this.enabled) {
      const url = 'https://telemetry.vercel.com/api/vercel-cli/v1/events';

      const sessionId = this.events[0].sessionId;
      if (!sessionId) {
        this.output.debug('Unable to send metrics: no session ID');
        return;
      }
      const events = this.events.map(event => {
        delete event.sessionId;
        const { eventTime, teamId, ...rest } = event;
        return { event_time: eventTime, team_id: teamId, ...rest };
      });
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Client-id': 'vercel-cli',
            'x-vercel-cli-topic-id': 'generic',
            'x-vercel-cli-session-id': sessionId,
          },
          body: JSON.stringify(events),
        });
        const wasRecorded =
          response.headers.get('x-vercel-cli-tracked') === '1';
        if (response.status !== 204) {
          this.output.debug(
            `Unexpected response from telemetry server: ${response.status}`
          );
        } else {
          if (wasRecorded) {
            this.output.debug(`Telemetry event tracked`);
          } else {
            this.output.debug(
              `Telemetry event ignored due to progressive rollout`
            );
          }
        }
      } catch (error) {
        if (error instanceof Error) {
          this.output.debug(
            `Error while sending telemetry data: ${error.message}`
          );
        }
      }
    }
  }
}
