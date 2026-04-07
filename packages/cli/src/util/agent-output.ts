import { isError } from '@vercel/error-utils';
import type Client from './client';
import { isAPIError, LinkRequiredError, ProjectNotFound } from './errors-ts';
import { packageName } from './pkg-name';

/**
 * Structured payload for "action required" (e.g. scope choice, login passcode).
 * When client.nonInteractive, commands output this as JSON and exit so agents
 * can parse and suggest the next command.
 */
export interface ActionRequiredPayload {
  status: 'action_required';
  reason?: string;
  action?: string;
  message: string;
  /**
   * When true, a human must act (e.g. login in TTY, approve in browser).
   * Agents should surface this to the user instead of retrying alone.
   */
  userActionRequired?: boolean;
  /** Hint for agents: run one of the commands in next[] to complete without prompting. */
  hint?: string;
  verification_uri?: string;
  choices?: Array<{ id: string; name: string }>;
  next?: Array<{ command: string; when?: string }>;
  /** When reason is 'missing_requirements', list of required items (e.g. 'missing_name', 'missing_value', 'git_branch_required') */
  missing?: string[];
}

/**
 * Type guard for ActionRequiredPayload (e.g. from ensureLink or selectOrg).
 */
export function isActionRequiredPayload(
  value: unknown
): value is ActionRequiredPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    (value as ActionRequiredPayload).status === 'action_required'
  );
}

/**
 * Structured payload for errors in non-interactive mode.
 */
export interface AgentErrorPayload {
  status: 'error';
  /**
   * Short, stable machine-readable reason code.
   * Prefer values from AGENT_REASON so agents can branch reliably.
   */
  reason: string;
  /** Human-readable message (no ANSI). */
  message: string;
  next?: Array<{ command: string; when?: string }>;
  /** Optional extra context for agents (plain text, no ANSI). */
  hint?: string;
  /** When true, a human must act before the command can succeed. */
  userActionRequired?: boolean;
  /** Dashboard or docs URL for agents that key off a dedicated field (optional). */
  verification_uri?: string;
}

/**
 * Builds the invoking CLI command with --yes added (or retained).
 * Used for non-interactive "confirmation required" payloads.
 */
export function buildCommandWithYes(
  argv: string[],
  pkgName: string = packageName
): string {
  const args = argv.slice(2);
  const hasYes = args.some(a => a === '--yes' || a === '-y');
  const out = hasYes ? [...args] : [...args, '--yes'];
  return `${pkgName} ${out.join(' ')}`;
}

/** Global flags that should be preserved in suggested "next" commands (e.g. --cwd, --non-interactive). */
const GLOBAL_FLAG_NAMES = new Set([
  '--cwd',
  '--config',
  '--yes',
  '-y',
  '--non-interactive',
  '--scope',
  '--team',
  '-S',
  '-T',
  '--token',
]);

/**
 * Returns global flag args from argv so suggested commands can include them (e.g. --cwd, --non-interactive).
 */
export function getGlobalFlagsFromArgv(argv: string[]): string[] {
  const args = argv.slice(2);
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const name = arg.startsWith('--') ? arg.split('=')[0] : arg;
    if (GLOBAL_FLAG_NAMES.has(name)) {
      out.push(arg);
      if (
        !arg.includes('=') &&
        i + 1 < args.length &&
        !args[i + 1].startsWith('-')
      ) {
        out.push(args[i + 1]);
        i++;
      }
    }
  }
  return out;
}

/**
 * Options for buildCommandWithGlobalFlags.
 * excludeFlags: flag names to omit from the suggested command (e.g. ['--non-interactive'] for login).
 */
export interface BuildCommandWithGlobalFlagsOptions {
  excludeFlags?: string[];
}

/**
 * Builds a suggested command string from a template and appends global flags from argv
 * (e.g. --cwd, --non-interactive) so the next command can be run with the same context.
 * Use excludeFlags to omit flags that must not appear (e.g. --non-interactive for login).
 */
export function buildCommandWithGlobalFlags(
  argv: string[],
  commandTemplate: string,
  pkgName: string = packageName,
  options?: BuildCommandWithGlobalFlagsOptions
): string {
  let preserved = getGlobalFlagsFromArgv(argv);
  if (options?.excludeFlags?.length) {
    const exclude = new Set(options.excludeFlags);
    const out: string[] = [];
    for (let i = 0; i < preserved.length; i++) {
      const arg = preserved[i];
      const name = arg.startsWith('--') ? arg.split('=')[0] : arg;
      if (exclude.has(name)) {
        if (
          !arg.includes('=') &&
          i + 1 < preserved.length &&
          !preserved[i + 1].startsWith('-')
        ) {
          i++;
        }
        continue;
      }
      out.push(arg);
    }
    preserved = out;
  }
  const base = `${pkgName} ${commandTemplate}`;
  if (preserved.length === 0) return base;
  return `${base} ${preserved.join(' ')}`;
}

/**
 * Returns args that should be preserved when suggesting a "next" command for "env add".
 * These are all args after "env add" and its 0–3 positionals (name, target, git-branch).
 */
export function getPreservedArgsForEnvAdd(argv: string[]): string[] {
  const args = argv.slice(2);
  const addIdx = args.indexOf('add');
  if (addIdx === -1 || args[addIdx - 1] !== 'env') return args;
  let i = addIdx + 1;
  let positionals = 0;
  while (i < args.length && positionals < 3 && !args[i].startsWith('-')) {
    positionals++;
    i++;
  }
  return args.slice(i);
}

/**
 * Builds a suggested "env add" command with the given template and appends
 * preserved flags from argv (e.g. --cwd, --non-interactive) so the next command
 * can be run with the same context. Omits preserved flags that already appear
 * in the template (e.g. --yes) to avoid duplicates.
 */
export function buildEnvAddCommandWithPreservedArgs(
  argv: string[],
  commandTemplate: string,
  pkgName: string = packageName
): string {
  let preserved = getPreservedArgsForEnvAdd(argv);
  // Avoid duplicating flags that are already in the template (e.g. --yes)
  if (commandTemplate.includes('--yes')) {
    preserved = preserved.filter(a => a !== '--yes' && a !== '-y');
  }
  if (commandTemplate.includes('--value')) {
    const out: string[] = [];
    for (let j = 0; j < preserved.length; j++) {
      if (preserved[j] === '--value' && j + 1 < preserved.length) {
        j++; // skip --value and its value
        continue;
      }
      if (preserved[j].startsWith('--value=')) continue;
      out.push(preserved[j]);
    }
    preserved = out;
  }
  const base = `${pkgName} ${commandTemplate}`;
  if (preserved.length === 0) return base;
  return `${base} ${preserved.join(' ')}`;
}

/**
 * Returns args after "env pull" and its 0–1 positionals (filename).
 */
export function getPreservedArgsForEnvPull(argv: string[]): string[] {
  const args = argv.slice(2);
  const pullIdx = args.indexOf('pull');
  if (pullIdx === -1 || args[pullIdx - 1] !== 'env') return args;
  let i = pullIdx + 1;
  if (i < args.length && !args[i].startsWith('-')) i++;
  return args.slice(i);
}

/**
 * Returns args after "env rm" and its 0–3 positionals (name, target, branch).
 */
export function getPreservedArgsForEnvRm(argv: string[]): string[] {
  const args = argv.slice(2);
  const rmIdx = args.indexOf('rm');
  if (rmIdx === -1 || args[rmIdx - 1] !== 'env') return args;
  let i = rmIdx + 1;
  let positionals = 0;
  while (i < args.length && positionals < 3 && !args[i].startsWith('-')) {
    positionals++;
    i++;
  }
  return args.slice(i);
}

/**
 * Builds a suggested "env rm" command with the given template and preserved flags from argv.
 */
export function buildEnvRmCommandWithPreservedArgs(
  argv: string[],
  commandTemplate: string,
  pkgName: string = packageName
): string {
  let preserved = getPreservedArgsForEnvRm(argv);
  if (commandTemplate.includes('--yes')) {
    preserved = preserved.filter(a => a !== '--yes' && a !== '-y');
  }
  const base = `${pkgName} ${commandTemplate}`;
  if (preserved.length === 0) return base;
  return `${base} ${preserved.join(' ')}`;
}

/**
 * Returns args after "env update" and its 0–3 positionals (name, target, branch).
 */
export function getPreservedArgsForEnvUpdate(argv: string[]): string[] {
  const args = argv.slice(2);
  const updateIdx = args.indexOf('update');
  if (updateIdx === -1 || args[updateIdx - 1] !== 'env') return args;
  let i = updateIdx + 1;
  let positionals = 0;
  while (i < args.length && positionals < 3 && !args[i].startsWith('-')) {
    positionals++;
    i++;
  }
  return args.slice(i);
}

/**
 * Builds a suggested "env update" command with the given template and preserved flags from argv.
 */
export function buildEnvUpdateCommandWithPreservedArgs(
  argv: string[],
  commandTemplate: string,
  pkgName: string = packageName
): string {
  let preserved = getPreservedArgsForEnvUpdate(argv);
  if (commandTemplate.includes('--yes')) {
    preserved = preserved.filter(a => a !== '--yes' && a !== '-y');
  }
  if (commandTemplate.includes('--value')) {
    const out: string[] = [];
    for (let i = 0; i < preserved.length; i++) {
      if (preserved[i] === '--value' && i + 1 < preserved.length) {
        i++;
        continue;
      }
      if (preserved[i].startsWith('--value=')) continue;
      out.push(preserved[i]);
    }
    preserved = out;
  }
  const base = `${pkgName} ${commandTemplate}`;
  if (preserved.length === 0) return base;
  return `${base} ${preserved.join(' ')}`;
}

/**
 * Builds the invoking CLI command with --scope set to the given slug
 * (strips existing --scope/--team from argv so the result is canonical).
 */
export function buildCommandWithScope(
  argv: string[],
  scopeSlug: string,
  pkgName: string = packageName
): string {
  const args = argv.slice(2);
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    // Handle space-separated: --scope VALUE, --team VALUE, -S VALUE, -T VALUE
    if (
      args[i] === '--scope' ||
      args[i] === '--team' ||
      args[i] === '-S' ||
      args[i] === '-T'
    ) {
      i++; // skip the next arg (the value)
      continue;
    }
    // Handle equals-separated: --scope=VALUE, --team=VALUE
    if (args[i].startsWith('--scope=') || args[i].startsWith('--team=')) {
      continue;
    }
    out.push(args[i]);
  }
  out.push('--scope', scopeSlug);
  return `${pkgName} ${out.join(' ')}`;
}

/**
 * Enriches an action_required payload so next[] includes both:
 * - Link command per choice (so the agent can link once for future commands).
 * - Invoking command with --scope per choice (so the agent can retry the same command without linking).
 * Pass argv from the current process (e.g. client.argv) to build the invoking command.
 */
export function enrichActionRequiredWithInvokingCommand(
  payload: ActionRequiredPayload,
  argv: string[]
): ActionRequiredPayload {
  if (!payload.choices?.length) {
    return payload;
  }
  const next: Array<{ command: string; when?: string }> = [];
  // Build argv for "link" so the link command preserves flags like --project, --yes
  const linkArgv = [...argv.slice(0, 2), 'link', ...argv.slice(3)];
  for (const choice of payload.choices) {
    const slug = choice.name;
    next.push({
      command: buildCommandWithScope(linkArgv, slug),
      when: 'Link first (then run any command without --scope)',
    });
    next.push({
      command: buildCommandWithScope(argv, slug),
      when: 'Run this command with scope (no link)',
    });
  }
  return { ...payload, next };
}

/**
 * When client.nonInteractive, writes the action_required payload as a single
 * JSON line to stdout and exits with exitCode (default 1).
 * The payload's next[] is enriched with both link commands and the invoking command with --scope.
 * In interactive mode, does nothing (caller should show prompts or errors as usual).
 */
export function outputActionRequired(
  client: Client,
  payload: ActionRequiredPayload,
  exitCode: number = 1
): void {
  if (!client.nonInteractive) {
    return;
  }
  const enriched = enrichActionRequiredWithInvokingCommand(
    payload,
    client.argv
  );
  if (!enriched.hint && enriched.next?.length) {
    enriched.hint =
      'Run one of the commands in next[] to complete without prompting.';
  }
  client.stdout.write(`${JSON.stringify(enriched, null, 2)}\n`);
  process.exit(exitCode);
}

/** True when argv explicitly requests non-interactive mode (matches main `index.ts`). */
export function argvHasNonInteractive(argv: string[] | undefined): boolean {
  if (!argv?.length) {
    return false;
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--non-interactive') {
      return argv[i + 1] !== 'false';
    }
    if (a.startsWith('--non-interactive=')) {
      return a.slice('--non-interactive='.length) !== 'false';
    }
  }
  return false;
}

/** True when the command should emit JSON agent payloads instead of only stderr (matches `outputAgentError`). */
export function shouldEmitNonInteractiveCommandError(client: Client): boolean {
  return client.nonInteractive || argvHasNonInteractive(client.argv ?? []);
}

/**
 * Writes a single JSON error payload to stdout and exits when non-interactive
 * (`client.nonInteractive` or `--non-interactive` on argv).
 */
export function outputAgentError(
  client: Client,
  payload: AgentErrorPayload,
  exitCode: number = 1
): void {
  if (!shouldEmitNonInteractiveCommandError(client)) {
    return;
  }
  client.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(exitCode);
}

/** Suggested follow-ups for `edge-config` failures (only callers of exitWithNonInteractiveError). */
function buildNextStepsForEdgeConfig(
  client: Client
): NonNullable<AgentErrorPayload['next']> {
  return [
    {
      command: buildCommandWithGlobalFlags(client.argv, 'edge-config list'),
      when: 'List Edge Config stores in the current team scope',
    },
    {
      command: buildCommandWithGlobalFlags(client.argv, 'teams switch'),
      when: 'Switch to the team that owns the Edge Config',
    },
    {
      command: buildCommandWithGlobalFlags(client.argv, 'whoami'),
      when: 'Verify the current team or user scope',
    },
  ];
}

const EDGE_CONFIG_NON_INTERACTIVE_HINT =
  'Edge Config commands use your current team scope. Pass --scope or run `vercel teams switch` if the store is missing.';

export type ExitWithNonInteractiveErrorVariant =
  | 'members'
  | 'access-groups'
  | 'access-summary'
  | 'speed-insights'
  | 'web-analytics'
  | 'checks'
  | 'edge-config';

type ProjectExitWithNonInteractiveVariant = Exclude<
  ExitWithNonInteractiveErrorVariant,
  'edge-config'
>;

/** Suggested follow-ups for project subcommands that use `exitWithNonInteractiveError`. */
function buildNextStepsForProjectSubcommands(
  client: Client,
  variant: ProjectExitWithNonInteractiveVariant
): NonNullable<AgentErrorPayload['next']> {
  const byName =
    variant === 'access-groups'
      ? {
          template: 'project access-groups <name>' as const,
          when: 'List access groups by project name (replace <name>)',
        }
      : variant === 'access-summary'
        ? {
            template: 'project access-summary <name>' as const,
            when: 'Show role counts by project name (replace <name>)',
          }
        : variant === 'speed-insights'
          ? {
              template: 'project speed-insights <name>' as const,
              when: 'Enable Speed Insights by project name (replace <name>)',
            }
          : variant === 'web-analytics'
            ? {
                template: 'project web-analytics <name>' as const,
                when: 'Enable Web Analytics by project name (replace <name>)',
              }
            : variant === 'checks'
              ? {
                  template: 'project checks add <name>' as const,
                  when: 'Create a deployment check by project name (replace <name>)',
                }
              : {
                  template: 'project members <name>' as const,
                  when: 'List members by project name (replace <name>)',
                };
  return [
    {
      command: buildCommandWithGlobalFlags(client.argv, 'link'),
      when: 'Re-link this directory to the correct Vercel project',
    },
    {
      command: buildCommandWithGlobalFlags(client.argv, byName.template),
      when: byName.when,
    },
    {
      command: buildCommandWithGlobalFlags(client.argv, 'project ls'),
      when: 'List projects in the current team to pick a name',
    },
  ];
}

const PROJECT_SUBCOMMAND_ERROR_HINT =
  'If you use --cwd, ensure that folder is linked to the right project, or pass an explicit project name. Use --scope when the project belongs to another team.';

function resolveNonInteractiveDefaults(
  client: Client,
  variant: ExitWithNonInteractiveErrorVariant
): Pick<AgentErrorPayload, 'next' | 'hint'> {
  if (variant === 'edge-config') {
    return {
      next: buildNextStepsForEdgeConfig(client),
      hint: EDGE_CONFIG_NON_INTERACTIVE_HINT,
    };
  }
  return {
    next: buildNextStepsForProjectSubcommands(client, variant),
    hint: PROJECT_SUBCOMMAND_ERROR_HINT,
  };
}

function writeAgentErrorPayloadAndExit(
  client: Client,
  payload: AgentErrorPayload,
  exitCode: number,
  variant: ExitWithNonInteractiveErrorVariant
): void {
  const defaults = resolveNonInteractiveDefaults(client, variant);
  const out: AgentErrorPayload = {
    ...payload,
    next: payload.next ?? defaults.next,
    hint: payload.hint ?? defaults.hint,
  };
  client.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  process.exit(exitCode);
}

function isProjectNotFoundLike(err: unknown): boolean {
  if (err instanceof ProjectNotFound) {
    return true;
  }
  if (
    isError(err) &&
    'code' in err &&
    (err as { code: unknown }).code === 'PROJECT_NOT_FOUND'
  ) {
    return true;
  }
  return false;
}

function isLinkRequiredLike(err: unknown): boolean {
  return err instanceof LinkRequiredError;
}

/** Normalize API error text for classification (strip trailing " (404)" etc.). */
function normalizeApiErrorText(message: string): string {
  return message.replace(/\s*\(\d{3}\)\s*$/, '').trim();
}

/**
 * In `--non-interactive` mode, maps project resolution / API failures to a
 * single JSON object on stdout (see docs/non-interactive-mode.md) and exits.
 * In interactive mode, does nothing — the caller should use `printError` or
 * similar.
 *
 * Also honors `--non-interactive` on argv when emitting JSON, so automation
 * still gets structured output even if `client.nonInteractive` was not set.
 */
export function exitWithNonInteractiveError(
  client: Client,
  err: unknown,
  exitCode: number = 1,
  options: { variant: ExitWithNonInteractiveErrorVariant } = {
    variant: 'members',
  }
): void {
  if (!shouldEmitNonInteractiveCommandError(client)) {
    return;
  }
  const { variant } = options;
  if (isLinkRequiredLike(err)) {
    if (variant === 'edge-config') {
      writeAgentErrorPayloadAndExit(
        client,
        {
          status: 'error',
          reason: 'link_required',
          message: err instanceof Error ? err.message : String(err),
          next: buildNextStepsForEdgeConfig(client),
          hint: EDGE_CONFIG_NON_INTERACTIVE_HINT,
        },
        exitCode,
        'edge-config'
      );
      return;
    }
    writeAgentErrorPayloadAndExit(
      client,
      {
        status: 'error',
        reason: 'link_required',
        message: err instanceof Error ? err.message : String(err),
      },
      exitCode,
      variant
    );
    return;
  }
  if (isProjectNotFoundLike(err)) {
    writeAgentErrorPayloadAndExit(
      client,
      {
        status: 'error',
        reason: 'project_not_found',
        message: err instanceof Error ? err.message : String(err),
      },
      exitCode,
      variant
    );
    return;
  }
  if (isAPIError(err)) {
    const rawMessage = err.serverMessage || err.message;
    const message = normalizeApiErrorText(rawMessage);
    const reason: string =
      err.status === 403
        ? 'forbidden'
        : err.status === 401
          ? 'not_authorized'
          : err.status === 404
            ? variant === 'edge-config'
              ? 'not_found'
              : 'project_not_found'
            : err.status === 429
              ? 'rate_limited'
              : 'api_error';
    writeAgentErrorPayloadAndExit(
      client,
      {
        status: 'error',
        reason,
        message,
      },
      exitCode,
      variant
    );
  }
  writeAgentErrorPayloadAndExit(
    client,
    {
      status: 'error',
      reason: 'unexpected_error',
      message: err instanceof Error ? err.message : String(err),
    },
    exitCode,
    variant
  );
}

/**
 * Returns a shell command that opens a URL in the user's default browser.
 * Used in agent error payloads so the `next[]` command is directly runnable.
 */
export function openUrlInBrowserCommand(url: string): string {
  if (process.platform === 'win32') return `start ${url}`;
  if (process.platform === 'darwin') return `open '${url}'`;
  return `xdg-open '${url}'`;
}
