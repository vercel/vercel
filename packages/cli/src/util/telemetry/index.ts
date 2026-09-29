import { randomUUID } from 'node:crypto';
import os from 'node:os';
import type { GlobalConfig } from '@vercel-internals/types';
import output from '../../output-manager';
import { PROJECT_ENV_TARGET } from '@vercel-internals/constants';
import {
  getOrCreatePersistedCliDevice,
  getOrCreatePersistedCliSession,
  type PersistedCliDevice,
  type PersistedCliDeviceOptions,
  touchPersistedCliSession,
  type PersistedCliSession,
  type PersistedCliSessionOptions,
} from './session';
import {
  sendTelemetryToSubprocess,
  type TelemetryFlushPayload,
  type TelemetryGateway,
} from '../../gateways/telemetry-gateway';

const LogLabel = `['telemetry']:`;
const MAX_ERROR_SERVER_MESSAGE_LENGTH = 500;

interface Args {
  opts: Options;
}

interface Options {
  store: TelemetryEventStore;
  isDebug?: boolean;
}

interface Event {
  teamId?: string;
  userId?: string;
  projectId?: string;
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

  protected trackTargetEnvironment(
    targetEnvironment: 'production' | 'preview'
  ) {
    this.track({
      key: 'target_environment',
      value: targetEnvironment,
    });
  }

  protected trackCommandOutput(eventData: { key: string; value: string }) {
    this.track({
      key: `output:${eventData.key}`,
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

  protected trackStdinIsTTY(isTTY: boolean) {
    this.track({
      key: 'stdin_is_tty',
      value: isTTY ? 'true' : 'false',
    });
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

  protected trackProjectId(projectId: string | undefined) {
    if (projectId) {
      this.track({
        key: 'project_id',
        value: projectId,
      });
    }
  }

  protected trackInvocationId(invocationId: string | undefined) {
    if (invocationId) {
      this.track({
        key: 'invocation_id',
        value: invocationId,
      });
    }
  }

  protected trackDeviceId(deviceId: string | undefined) {
    if (deviceId) {
      this.track({
        key: 'device_id',
        value: deviceId,
      });
    }
  }

  protected trackVercelPluginActiveSession() {
    this.track({
      key: 'vercel_plugin_active_session',
      value: 'TRUE',
    });
  }

  protected trackVercelPluginVersion(version: string | undefined) {
    if (version) {
      this.track({
        key: 'vercel_plugin_version',
        value: version,
      });
    }
  }

  protected trackErrorStatus(status: number | string | undefined) {
    if (typeof status !== 'undefined') {
      this.track({
        key: 'error_status',
        value: String(status),
      });
    }
  }

  protected trackErrorCode(code: string | undefined) {
    if (code) {
      this.track({
        key: 'error_code',
        value: code,
      });
    }
  }

  protected trackErrorSlug(slug: string | undefined) {
    if (slug) {
      this.track({
        key: 'error_slug',
        value: slug,
      });
    }
  }

  protected trackErrorAction(action: string | undefined) {
    if (action) {
      this.track({
        key: 'error_action',
        value: action,
      });
    }
  }

  protected trackErrorServerMessage(serverMessage: string | undefined) {
    if (serverMessage) {
      const normalizedServerMessage = serverMessage.trim().replace(/\s+/g, ' ');
      this.track({
        key: 'error_server_message',
        value: normalizedServerMessage.slice(
          0,
          MAX_ERROR_SERVER_MESSAGE_LENGTH
        ),
      });
    }
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

  /**
   * Tracks the --format option for JSON output.
   * This is a common option across many commands, so it's defined in the base class.
   */
  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      const allowedFormat = ['json'].includes(format)
        ? format
        : this.redactedValue;
      this.trackCliOption({
        option: 'format',
        value: allowedFormat,
      });
    }
  }

  /**
   * Tracks the --project option. Value is redacted because project names/IDs
   * may be sensitive. Accepts `string | string[]` so commands with a repeatable
   * `--project` can override. Not all commands support repeated `--project` flags
   */
  trackCliOptionProject(value: string | string[] | undefined) {
    if (!value) return;
    if (Array.isArray(value) && value.length === 0) return;

    this.trackCliOption({
      option: 'project',
      value: this.redactedValue,
    });
  }
}

export class TelemetryEventStore {
  private events: Event[];
  private isDebug: boolean;
  private sessionId: string;
  private invocationId: string;
  private deviceId: string;
  private teamId = 'NO_TEAM_ID';
  private userId = 'NO_USER_ID';
  private projectId = 'NO_PROJECT_ID';
  private config: GlobalConfig['telemetry'];
  private cliDevice?: PersistedCliDevice;
  private cliSession?: PersistedCliSession;
  private cliDeviceOptions?: PersistedCliDeviceOptions;
  private cliSessionOptions?: PersistedCliSessionOptions;
  private telemetry?: TelemetryGateway;

  /**
   * @param opts.telemetry Telemetry host gateway. When set, device/session
   * identity and delivery go through it instead of `cliDevice`/`cliSession`.
   * @param opts.persistIdentity With `telemetry`, whether to load and touch
   * the persisted device/session identity. Defaults to `true`.
   */
  constructor(opts?: {
    isDebug?: boolean;
    config: GlobalConfig['telemetry'];
    cliDevice?: PersistedCliDeviceOptions;
    cliSession?: PersistedCliSessionOptions;
    telemetry?: TelemetryGateway;
    persistIdentity?: boolean;
  }) {
    this.isDebug = opts?.isDebug || false;
    this.events = [];
    this.config = opts?.config;
    this.telemetry = opts?.telemetry;
    this.invocationId = randomUUID();
    this.deviceId = randomUUID();

    if (this.telemetry) {
      if (opts?.persistIdentity ?? true) {
        this.deviceId = this.telemetry.loadDeviceId();
        this.cliSession = this.telemetry.loadSession();
        this.sessionId = this.cliSession.id;
      } else {
        this.sessionId = randomUUID();
      }
      return;
    }

    this.cliDeviceOptions = opts?.cliDevice;
    this.cliSessionOptions = opts?.cliSession;

    if (this.cliDeviceOptions) {
      this.cliDevice = getOrCreatePersistedCliDevice(this.cliDeviceOptions);
      this.deviceId = this.cliDevice.id;
    }

    if (this.cliSessionOptions) {
      this.cliSession = getOrCreatePersistedCliSession(this.cliSessionOptions);
      this.sessionId = this.cliSession.id;
    } else {
      this.sessionId = randomUUID();
    }
  }

  add(event: Event) {
    event.sessionId = this.sessionId;
    event.teamId = this.teamId;
    event.userId = this.userId;
    event.projectId = this.projectId;
    this.events.push(event);
  }

  updateTeamId(teamId?: string) {
    if (teamId) {
      this.teamId = teamId;
    }
  }

  updateUserId(userId?: string) {
    if (userId) {
      this.userId = userId;
    }
  }

  updateProjectId(projectId?: string) {
    if (projectId) {
      this.projectId = projectId;
    }
  }

  get hasUserId() {
    return this.userId !== 'NO_USER_ID';
  }

  get currentProjectId() {
    return this.projectId;
  }

  get currentInvocationId() {
    return this.invocationId;
  }

  get currentDeviceId() {
    return this.deviceId;
  }

  get currentSessionId() {
    return this.sessionId;
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
    if (this.telemetry && this.cliSession) {
      this.cliSession = this.telemetry.touchSession({
        session: this.cliSession,
      });
    } else if (this.cliSession && this.cliSessionOptions) {
      this.cliSession = touchPersistedCliSession(
        this.cliSessionOptions,
        this.cliSession
      );
    }

    if (this.isDebug) {
      // Intentionally not using `output.debug` as it will
      // not write to stderr unless it is run with `--debug`
      output.log(`${LogLabel} Flushing Events`);
      for (const event of this.events) {
        event.teamId = this.teamId;
        event.userId = this.userId;
        event.projectId = this.projectId;
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
        delete event.userId;
        delete event.projectId;
        const { eventTime, ...rest } = event;
        return {
          event_time: eventTime,
          team_id: this.teamId,
          user_id: this.userId,
          project_id: this.projectId,
          ...rest,
        };
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
   * Delivers the telemetry payload: through the telemetry gateway when one
   * was provided, otherwise via the `telemetry flush` subprocess.
   */
  async sendToSubprocess(
    payload: TelemetryFlushPayload,
    outputDebugEnabled: boolean
  ) {
    if (this.telemetry) {
      return this.telemetry.send({ payload, debug: outputDebugEnabled });
    }
    return sendTelemetryToSubprocess(payload, outputDebugEnabled);
  }
}
