import { randomUUID } from 'node:crypto';
import os from 'node:os';
import type { GlobalConfig } from '@vercel-internals/types';
import output from '../../output-manager';
import { spawn } from 'node:child_process';
import { PROJECT_ENV_TARGET } from '@vercel-internals/constants';
import { cloneEnv } from '@vercel/build-utils';
import {
  getOrCreatePersistedCliDevice,
  getOrCreatePersistedCliSession,
  type PersistedCliDevice,
  type PersistedCliDeviceOptions,
  touchPersistedCliSession,
  type PersistedCliSession,
  type PersistedCliSessionOptions,
} from './session';
import { isNativeBinaryInstall } from '../native-install';
import type { TraceEvent } from '@vercel/build-utils';

const LogLabel = `['telemetry']:`;
const MAX_ERROR_SERVER_MESSAGE_LENGTH = 500;

interface Args {
  opts: Options;
}

interface Options {
  store: TelemetryEventStore;
  isDebug?: boolean;
}

/** Which package `dist/vc.js` ran, and why it fell back to its own JS CLI. */
export type Launch =
  | {
      runtime: 'native';
      /** Set when the binary came from the launcher's download cache. */
      source?: string;
    }
  | { runtime: 'cli-support' }
  | {
      runtime: 'dist';
      target: string;
      reason: string;
    };

interface Event {
  teamId?: string;
  userId?: string;
  projectId?: string;
  sessionId?: string;
  invocationId?: string;
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

  /** Records that an option was passed, never its value. */
  protected trackRedactedCliOption(option: string, value: string | undefined) {
    if (value) {
      this.trackCliOption({ option, value: this.redactedValue });
    }
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

  /** Records a hidden short flag that was used, like `-d`, never its value. */
  protected trackDeprecatedShorthand(shorthand: string) {
    this.track({
      key: 'deprecated_shorthand',
      value: shorthand,
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

  protected trackLibc(libc: string | undefined) {
    if (libc) {
      this.track({
        key: 'libc',
        value: libc,
      });
    }
  }

  protected trackLaunch(launch: Launch) {
    this.track({ key: 'launcher', value: launch.runtime });
    if (launch.runtime === 'native' && launch.source) {
      this.track({ key: 'launcher_source', value: launch.source });
    }
    if (launch.runtime !== 'dist') return;
    this.track({ key: 'launcher_target', value: launch.target });
    this.track({ key: 'launcher_fallback', value: launch.reason });
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
  private commandTrace?: { event: TraceEvent; buildLabel?: string };
  private events: Event[];
  private isDebug: boolean;
  private sessionId: string;
  private invocationId: string;
  private deviceId: string;
  private teamId = 'NO_TEAM_ID';
  private userId = 'NO_USER_ID';
  private projectId = 'NO_PROJECT_ID';
  private config: GlobalConfig['telemetry'];
  private globalConfigDir?: string;
  private cliDevice?: PersistedCliDevice;
  private cliSession?: PersistedCliSession;
  private cliDeviceOptions?: PersistedCliDeviceOptions;
  private cliSessionOptions?: PersistedCliSessionOptions;

  constructor(opts?: {
    isDebug?: boolean;
    config: GlobalConfig['telemetry'];
    globalConfigDir?: string;
    cliDevice?: PersistedCliDeviceOptions;
    cliSession?: PersistedCliSessionOptions;
  }) {
    this.isDebug = opts?.isDebug || false;
    this.events = [];
    this.config = opts?.config;
    this.globalConfigDir = opts?.globalConfigDir;
    this.cliDeviceOptions = opts?.cliDevice;
    this.cliSessionOptions = opts?.cliSession;
    this.invocationId = randomUUID();
    this.deviceId = randomUUID();

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
    event.invocationId = this.invocationId;
    event.teamId = this.teamId;
    event.userId = this.userId;
    event.projectId = this.projectId;
    this.events.push(event);
  }

  updateConfig(config: GlobalConfig['telemetry']) {
    this.config = config;
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

  get currentLibc() {
    return this.cliDevice?.libc;
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

  setCommandTrace(event: TraceEvent, buildLabel?: string) {
    this.commandTrace = { event, buildLabel };
  }

  /**
   * Sends the events through a `telemetry flush` subprocess. `detach` starts it
   * detached even with `--debug`, for callers that exit right after, since the
   * debug subprocess is attached and would die with this process.
   */
  async save({ detach = false }: { detach?: boolean } = {}) {
    if (this.cliSession && this.cliSessionOptions) {
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
      if (this.commandTrace) {
        // Labeled so tools that parse the `> {` event lines skip it.
        output.log(
          `${LogLabel} Command trace ${JSON.stringify(this.commandTrace)}`
        );
      }

      return;
    }

    if (this.enabled) {
      const sessionId = this.events[0]?.sessionId;
      if (!sessionId) {
        output.debug('Unable to send metrics: no session ID');
        return;
      }
      const events = this.events.map(event => {
        const { eventTime, invocationId, ...rest } = event;
        delete rest.sessionId;
        delete rest.teamId;
        delete rest.userId;
        delete rest.projectId;
        return {
          event_time: eventTime,
          invocation_id: invocationId,
          team_id: this.teamId,
          user_id: this.userId,
          project_id: this.projectId,
          ...rest,
        };
      });
      const payload = {
        // The flush subprocess has its own store; retain this command's identity.
        invocationId: this.invocationId,
        headers: {
          'Client-id': 'vercel-cli',
          'x-vercel-cli-topic-id': 'generic',
          'x-vercel-cli-session-id': sessionId,
        },
        body: events,
        ...(this.commandTrace ? { commandTrace: this.commandTrace } : {}),
      };
      await this.sendToSubprocess(payload, output.debugEnabled && !detach);
    }
  }

  /** Hand telemetry to the existing worker without exposing its payload in argv. */
  async sendToSubprocess(payload: object, outputDebugEnabled: boolean) {
    const serialized = JSON.stringify(payload);
    const flushArgs = ['telemetry', 'flush'];
    if (this.globalConfigDir) {
      flushArgs.push('--global-config', this.globalConfigDir);
    }
    let nodeBinaryPath: string;
    let script: string[];
    if (isNativeBinaryInstall()) {
      // In the standalone binary, `process.argv[1]` is a virtual snapshot path
      // (e.g. `/snapshot/cli/pkg.js`) and the binary always runs its embedded
      // entrypoint, so a script path argument would be parsed as a deploy path.
      nodeBinaryPath = process.execPath;
      script = flushArgs;
    } else {
      const args = [process.execPath, process.argv[0], process.argv[1]];
      if (args[0] === args[1]) {
        args.shift();
      }
      nodeBinaryPath = args[0];
      script = [...args.slice(1), ...flushArgs];
    }
    // We need to disable telemetry in the subprocess, otherwise we'll end up in an infinite loop
    const env = cloneEnv(process.env, {
      VERCEL_TELEMETRY_DISABLED: '1',
    });
    // When debugging, we want to know about the response from the server, so we can't exit early
    if (outputDebugEnabled) {
      return new Promise<void>(resolve => {
        const childProcess = spawn(nodeBinaryPath, script, {
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        childProcess.stdin.on('error', () => {});
        childProcess.stdin.end(serialized);

        childProcess.stderr.on('data', data => output.debug(data.toString()));
        childProcess.stdout.on('data', data => output.debug(data.toString()));
        childProcess.on('error', d => {
          output.debug(d);
          clearTimeout(timeout);
          resolve();
        });

        const timeout = setTimeout(() => {
          // If the subprocess doesn't respond within 2 seconds, kill it so the process can exit
          output.debug('Telemetry subprocess killed due to timeout');
          childProcess.kill();
        }, 2000);

        childProcess.on('exit', code => {
          output.debug(`Telemetry subprocess exited with code ${code}`);
          childProcess.unref();
          clearTimeout(timeout);
          // An error in the subprocess should not trigger a bad exit code, so don't reject under any circumstances
          resolve();
        });
      });
    } else {
      const childProcess = spawn(nodeBinaryPath, script, {
        stdio: ['pipe', 'ignore', 'ignore'],
        env,
        windowsHide: true,
        detached: true,
      });

      childProcess.on('error', () => {});
      childProcess.stdin.on('error', () => {});
      childProcess.stdin.end(serialized);
      childProcess.unref();
    }
  }
}
