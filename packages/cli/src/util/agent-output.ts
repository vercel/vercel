import type Client from './client';
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
  reason: string;
  message: string;
  next?: Array<{ command: string }>;
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
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(enriched, null, 2));
  process.exit(exitCode);
}

/**
 * When client.nonInteractive, writes the error payload as a single JSON line
 * to stdout and exits with exitCode (default 1).
 * In interactive mode, does nothing (caller should print error as usual).
 */
export function outputAgentError(
  client: Client,
  payload: AgentErrorPayload,
  exitCode: number = 1
): void {
  if (!client.nonInteractive) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload, null, 2));
  process.exit(exitCode);
}
