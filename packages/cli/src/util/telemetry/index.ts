import { randomUUID } from 'node:crypto';
import os from 'node:os';
import type { GlobalConfig } from '@vercel-internals/types';
import output from '../../output-manager';
import { spawn } from 'node:child_process';
import { PROJECT_ENV_TARGET } from '@vercel-internals/constants';
import { cloneEnv } from '@vercel/build-utils';

const LogLabel = `['telemetry']:`;

interface Args {
  opts: Options;
}

interface Options {
  store: TelemetryEventStore;
  isDebug?: boolean;
}

interface Event {
  teamId?: string;
  sessionId?: string;
  eventTime: number;
  id: string;
  key: string;
  value: string;
}

export class TelemetryClient {
  private isDebug: boolean;
  store: TelemetryEventStore;

  protected redactedValue = '[REDACTED]';
  protected noValueToTriggerPrompt = '[TRIGGER_PROMPT]';
  protected redactedArgumentsLength = (args: string[]) => {
    if (args && args.length === 1) {
      return 'ONE';
    }
    if (args.length > 1) {
      return 'MANY';
    }
    return 'NONE';
  };
  protected redactedTargetName = (target: string) => {
    if ((PROJECT_ENV_TARGET as ReadonlyArray<string>).includes(target)) {
      return target;
    }
    return this.redactedValue;
  };

  constructor({ opts }: Args) {
    this.isDebug = opts.isDebug || false;
    this.store = opts.store;
  }

  private track(eventData: { key: string; value: string }) {
    if (this.isDebug) {
      output.debug(`${LogLabel} ${eventData.key}:${eventData.value}`);
    }

    const event: Event = {
      id: randomUUID(),
      eventTime: Date.now(),
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

  protected trackOidcTokenRefresh(count: number) {
    this.track({
      key: 'oidc-token-refresh',
      value: `${count}`,
    });
  }

  protected trackCPUs() {
    this.track({
      key: 'cpu_count',
      value: String(os.cpus().length),
    });
  }

  protected trackAgenticUse(agent: string | undefined) {
    if (agent) {
      this.track({
        key: 'agent',
        value: agent,
      });
    }
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

  protected trackCI(ciVendorName: string | null) {
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

  protected trackExtension() {
    this.track({
      key: 'extension',
      value: this.redactedValue,
    });
  }

  protected loginAttempt?: string;
  protected trackLoginState(
    state: 'started' | 'error' | 'canceled' | 'success'
  ) {
    if (state === 'started') this.loginAttempt = randomUUID();
    if (this.loginAttempt) {
      this.track({ key: `login:attempt:${this.loginAttempt}`, value: state });
    }
    if (state !== 'started') this.loginAttempt = undefined;
  }

  trackCliFlagHelp(command: string, subcommands?: string | string[]) {
    let subcommand: string | undefined;
    if (subcommands) {
      subcommand = Array.isArray(subcommands) ? subcommands[0] : subcommands;
    }

    this.track({
      key: 'flag:help',
      value: subcommand ? `${command}:${subcommand}` : command,
    });
  }
}

export class TelemetryEventStore {
  private events: Event[];
  private isDebug: boolean;
  private sessionId: string;
  private teamId = 'NO_TEAM_ID';
  private config: GlobalConfig['telemetry'];

  constructor(opts?: { isDebug?: boolean; config: GlobalConfig['telemetry'] }) {
    this.isDebug = opts?.isDebug || false;
    this.sessionId = randomUUID();
    this.events = [];
    this.config = opts?.config;
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

    return this.config?.enabled ?? true;
  }

  async save() {
    if (this.isDebug) {
      // Intentionally not using `output.debug` as it will
      // not write to stderr unless it is run with `--debug`
      output.log(`${LogLabel} Flushing Events`);
      for (const event of this.events) {
        event.teamId = this.teamId;
        output.log(JSON.stringify(event));
      }

      return;
    }

    if (this.enabled) {
      const sessionId = this.events[0].sessionId;
      if (!sessionId) {
        output.debug('Unable to send metrics: no session ID');
        return;
      }
      const events = this.events.map(event => {
        delete event.sessionId;
        delete event.teamId;
        const { eventTime, ...rest } = event;
        return { event_time: eventTime, team_id: this.teamId, ...rest };
      });
      const payload = {
        headers: {
          'Client-id': 'vercel-cli',
          'x-vercel-cli-topic-id': 'generic',
          'x-vercel-cli-session-id': sessionId,
        },
        body: events,
      };
      await this.sendToSubprocess(payload, output.debugEnabled);
    }
  }

  /**
   * Send the telemetry events to a subprocess, this invokes the `telemetry flush` command
   * and passes a stringified payload to the subprocess, there's a risk that if the event payload
   * increases in size, it may exceed the maximum buffer size for the subprocess, in which case the
   * child process will error and not send anything.
   * FIXME: handle max buffer size
   */
  async sendToSubprocess(payload: object, outputDebugEnabled: boolean) {
    const args = [process.execPath, process.argv[0], process.argv[1]];
    if (args[0] === args[1]) {
      args.shift();
    }
    const nodeBinaryPath = args[0];
    const script = [
      ...args.slice(1),
      'telemetry',
      'flush',
      JSON.stringify(payload),
    ];
    // We need to disable telemetry in the subprocess, otherwise we'll end up in an infinite loop
    const env = cloneEnv(process.env, {
      VERCEL_TELEMETRY_DISABLED: '1',
    });
    // When debugging, we want to know about the response from the server, so we can't exit early
    if (outputDebugEnabled) {
      return new Promise<void>(resolve => {
        const childProcess = spawn(nodeBinaryPath, script, {
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        childProcess.stderr.on('data', data => output.debug(data.toString()));
        childProcess.stdout.on('data', data => output.debug(data.toString()));
        childProcess.on('error', d => {
          output.debug(d);
        });

        const timeout = setTimeout(() => {
          // If the subprocess doesn't respond within 2 seconds, kill it so the process can exit
          output.debug('Telemetry subprocess killed due to timeout');
          childProcess.kill();
        }, 2000);

        childProcess.on('exit', code => {
          output.debug(`Telemetry subprocess exited with code ${code}`);
          childProcess.unref();
          timeout.unref();
          // An error in the subprocess should not trigger a bad exit code, so don't reject under any circumstances
          resolve();
        });
      });
    } else {
      const childProcess = spawn(nodeBinaryPath, script, {
        stdio: 'ignore',
        env,
        windowsHide: true,
        detached: true,
      });

      childProcess.unref();
    }
  }
}
