import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { isError } from '@vercel/error-utils';
import type { GlobalConfig } from '@vercel-internals/types';
import didYouMean from '../did-you-mean';
import {
  REDACTED,
  crashFrame,
  ctxHash,
  fp,
  gatedFlag,
  gatedToken,
  slug,
} from './sanitize';
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

const LogLabel = `['telemetry']:`;
const MAX_ERROR_SERVER_MESSAGE_LENGTH = 500;

function isV2(): boolean {
  return process.env.VERCEL_CLI_TELEMETRY_V2 === '1';
}

function getProperty<T extends 'string' | 'number'>(
  value: unknown,
  key: string,
  type: T
): (T extends 'string' ? string : number) | undefined {
  if (typeof value === 'object' && value !== null && key in value) {
    const property = (value as Record<string, unknown>)[key];
    if (typeof property === type) {
      return property as T extends 'string' ? string : number;
    }
  }
  return undefined;
}

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

  protected trackExitCode(code: number) {
    if (!isV2()) {
      return;
    }
    this.track({
      key: 'exit_code',
      value: String(code),
    });
  }

  private structuredErrorsSeen = new WeakSet<object>();
  private serverMessagesSeen = new WeakSet<object>();

  /**
   * Structured error fields for all users under v2; the free-text server
   * message only for agent sessions. Deduped per error object because both
   * `printError` and the top-level handler may see the same error.
   */
  protected trackError(err: unknown, opts: { agent?: boolean } = {}) {
    const ref = typeof err === 'object' && err !== null ? err : undefined;

    if (
      (opts.agent || isV2()) &&
      !(ref && this.structuredErrorsSeen.has(ref))
    ) {
      if (ref) {
        this.structuredErrorsSeen.add(ref);
      }
      this.trackErrorStatus(getProperty(err, 'status', 'number'));
      this.trackErrorCode(getProperty(err, 'code', 'string'));
      this.trackErrorSlug(getProperty(err, 'slug', 'string'));
      this.trackErrorAction(getProperty(err, 'action', 'string'));
      const link = getProperty(err, 'link', 'string');
      if (isV2() && link) {
        this.trackDocsLinkShown(link);
      }
    }

    if (opts.agent && !(ref && this.serverMessagesSeen.has(ref))) {
      if (ref) {
        this.serverMessagesSeen.add(ref);
      }
      this.trackErrorServerMessage(
        getProperty(err, 'serverMessage', 'string') ??
          (isError(err) ? err.message : undefined)
      );
    }
  }

  /**
   * The literal option name is only recorded when it resembles a known
   * flag of the command (mistyped-flag intent); anything else — which
   * could be arbitrary user content — is redacted.
   */
  protected trackParseError(err: unknown, knownFlags: readonly string[] = []) {
    if (!isV2()) {
      return;
    }
    const code = getProperty(err, 'code', 'string');
    let value = 'unknown';
    if (code === 'ARG_UNKNOWN_OPTION' && isError(err)) {
      const option = err.message.match(/: (\S+)$/)?.[1] ?? '';
      const similar = didYouMean(
        option.replace(/^-+/, ''),
        knownFlags.map(flag => flag.replace(/^-+/, '')),
        0.7
      );
      value = `unknown_option:${similar ? gatedFlag(option) : REDACTED}`;
    } else if (code?.startsWith('ARG_')) {
      value = code.toLowerCase();
    }
    this.track({ key: 'parse_error', value });
  }

  /**
   * The literal token is only recorded when a did-you-mean suggestion
   * exists (command intent); tokens without one may be mistyped directory
   * or project names, so only the fact is recorded.
   */
  protected trackCommandNotFound(token: string, suggestion?: string) {
    if (!isV2()) {
      return;
    }
    this.track({
      key: 'command_not_found',
      value: suggestion ? gatedToken(token) : REDACTED,
    });
    this.track({
      key: 'command_not_found_suggestion',
      value: suggestion ?? 'NONE',
    });
  }

  /** Same policy as trackCommandNotFound: literal only with a suggestion. */
  protected trackSubcommandNotFound(
    token: string | undefined,
    suggestion?: string
  ) {
    if (!isV2()) {
      return;
    }
    this.track({
      key: 'subcommand_not_found',
      value: token ? (suggestion ? gatedToken(token) : REDACTED) : 'NONE',
    });
  }

  protected trackDocsLinkShown(link: string) {
    if (!isV2()) {
      return;
    }
    this.track({ key: 'docs_link_shown', value: slug(link) });
  }

  protected trackHelpRendered(context: string) {
    if (!isV2()) {
      return;
    }
    this.track({ key: 'help_rendered', value: gatedToken(context) });
  }

  protected trackProjectConfigError(kind: 'parse' | 'not_found_explicit') {
    if (!isV2()) {
      return;
    }
    this.track({ key: 'project_config_error', value: kind });
  }

  protected trackProjectConfigValidation(code: string | undefined) {
    if (!isV2()) {
      return;
    }
    this.track({
      key: 'project_config_validation',
      value: code && /^[A-Z0-9_]{1,64}$/.test(code) ? code : REDACTED,
    });
  }

  protected trackConfigError(kind: 'read' | 'write') {
    if (!isV2()) {
      return;
    }
    this.track({ key: 'config_error', value: kind });
  }

  protected trackAuthConfigError(kind: 'read') {
    if (!isV2()) {
      return;
    }
    this.track({ key: 'auth_config_error', value: kind });
  }

  protected trackDeployState(readyState: string) {
    if (!isV2()) {
      return;
    }
    this.trackCommandOutput({
      key: 'deploy_state',
      value: /^[A-Z_]{1,32}$/.test(readyState) ? readyState : REDACTED,
    });
  }

  protected trackLogsMatched(matched: boolean) {
    if (!isV2()) {
      return;
    }
    this.trackCommandOutput({
      key: 'logs_matched',
      value: matched ? 'SOME' : 'NONE',
    });
  }

  protected trackArgsFingerprint(argv: readonly string[], salt: string) {
    if (!isV2()) {
      return;
    }
    this.track({ key: 'args_fingerprint', value: fp(argv, salt) });
  }

  protected trackAgentTaskId(id: string | undefined) {
    if (!isV2() || !id) {
      return;
    }
    // UUID-shape only: structurally incapable of carrying user content.
    this.track({
      key: 'agent_task_id',
      value: /^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$/.test(id)
        ? id.toLowerCase()
        : REDACTED,
    });
  }

  protected trackAgentVersion(version: string | undefined) {
    if (!isV2() || !version) {
      return;
    }
    this.track({
      key: 'agent_version',
      value: /^[\w.+-]{1,32}$/.test(version) ? version : REDACTED,
    });
  }

  protected trackAgentDetectionSource(
    source: 'env' | 'proctree' | 'both' | undefined
  ) {
    if (!isV2() || !source) {
      return;
    }
    this.track({ key: 'agent_detection_source', value: source });
  }

  protected trackAgentDetectionConflict(
    conflict: { env: string; proctree: string } | undefined
  ) {
    if (!isV2() || !conflict) {
      return;
    }
    this.track({
      key: 'agent_detection_conflict',
      value: `proctree:${conflict.proctree},env:${conflict.env}`,
    });
  }

  protected trackContextId(contextId: string | undefined) {
    if (!isV2() || !contextId) {
      return;
    }
    this.track({ key: 'context_id', value: contextId });
  }

  protected trackCrash(err: unknown) {
    if (!isV2()) {
      return;
    }
    const name =
      isError(err) && /^[a-zA-Z]{1,64}$/.test(err.name) ? err.name : 'Error';
    const stack = isError(err) ? err.stack : undefined;
    this.track({ key: 'crash', value: `${name}:${crashFrame(stack)}` });
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

export interface SessionContext {
  pid?: number;
  bootTime?: number;
  cwd?: string;
  agent?: string;
}

export class TelemetryEventStore {
  private events: Event[];
  private isDebug: boolean;
  private sessionId: string;
  private invocationId: string;
  private deviceId: string;
  // Local-only HMAC salt; unlike deviceId it is never sent, so hashes made
  // with it cannot be dictionary-tested by anyone holding the telemetry.
  private fpSalt: string;
  private contextId?: string;
  private teamId = 'NO_TEAM_ID';
  private userId = 'NO_USER_ID';
  private projectId = 'NO_PROJECT_ID';
  private config: GlobalConfig['telemetry'];
  private configLoaded: boolean;
  private cliDevice?: PersistedCliDevice;
  private cliSession?: PersistedCliSession;
  private cliDeviceOptions?: PersistedCliDeviceOptions;
  private cliSessionOptions?: PersistedCliSessionOptions;

  constructor(opts?: {
    isDebug?: boolean;
    config?: GlobalConfig['telemetry'];
    cliDevice?: PersistedCliDeviceOptions;
    cliSession?: PersistedCliSessionOptions;
    sessionContext?: SessionContext;
  }) {
    this.isDebug = opts?.isDebug || false;
    this.events = [];
    this.config = opts?.config;
    this.configLoaded = opts?.config !== undefined;
    this.cliDeviceOptions = opts?.cliDevice;
    this.cliSessionOptions = opts?.cliSession;
    this.invocationId = randomUUID();
    this.deviceId = randomUUID();
    this.fpSalt = randomUUID();

    if (this.cliDeviceOptions) {
      this.cliDevice = getOrCreatePersistedCliDevice(this.cliDeviceOptions);
      this.deviceId = this.cliDevice.id;
      this.fpSalt = this.cliDevice.fpSalt ?? this.fpSalt;
    }

    if (this.cliSessionOptions) {
      if (opts?.sessionContext) {
        const { pid, bootTime, cwd, agent } = opts.sessionContext;
        this.contextId = ctxHash(
          [pid ?? 0, bootTime ?? 0, cwd ?? '', agent ?? ''],
          this.fpSalt
        );
        this.cliSessionOptions = {
          ...this.cliSessionOptions,
          contextKey: this.contextId,
        };
      }
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

  // The store may be constructed before the global config is readable;
  // events are only sent once the config (and thus opt-out state) is known.
  updateConfig(config: GlobalConfig['telemetry']) {
    this.config = config;
    this.configLoaded = true;
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

  get currentFpSalt() {
    return this.fpSalt;
  }

  get currentSessionId() {
    return this.sessionId;
  }

  get currentContextId() {
    return this.contextId;
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
    if (!this.configLoaded) {
      return false;
    }

    return this.config?.enabled ?? true;
  }

  async save() {
    if (this.events.length === 0) {
      return;
    }

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
      // Prevent re-sending if save() runs again (e.g. crash after flush).
      this.reset();
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
    const flushArgs = ['telemetry', 'flush', JSON.stringify(payload)];
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
