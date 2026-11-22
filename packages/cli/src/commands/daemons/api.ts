import chalk from 'chalk';
import ms from 'ms';
import type { Project } from '@vercel-internals/types';
import type Client from '../../util/client';
import output from '../../output-manager';
import { withGlobalFlags } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import {
  validateJsonOutput,
  wantsMachineReadableOutput,
} from '../../util/output-format';
import cmd from '../../util/output/cmd';
import table from '../../util/output/table';
import { requireProjectContext } from '../../util/projects/require-project-context';
import { resolveProjectContext } from '../../util/projects/resolve-project-context';
import { writeJsonError } from '../../util/observability/jsonl';
import { isAPIError } from '../../util/errors-ts';
import { getErrorRecovery } from '../../util/error-recovery';
import { DaemonsTelemetryClient } from '../../util/telemetry/commands/daemons';
import type arg from 'arg';
import type { CommandOption } from '../help';

export function isJsonOutput(client: Client): boolean {
  return (
    wantsMachineReadableOutput('daemons', client.argv) || client.nonInteractive
  );
}

/** Reports thrown errors using the command's selected output format. */
export function reportError(
  client: Client,
  err: unknown,
  exitCode = 1
): number {
  if (!isJsonOutput(client)) {
    printError(err, client);
    return exitCode;
  }
  const apiError = isAPIError(err) ? err : undefined;
  const reason =
    exitCode === 2 ? AGENT_REASON.INVALID_ARGUMENTS : AGENT_REASON.API_ERROR;
  const message =
    exitCode === 2 && err instanceof Error
      ? err.message
      : "Couldn't complete the daemon command.";
  return writeJsonError(
    client,
    {
      status: AGENT_STATUS.ERROR,
      reason,
      message,
      ...(apiError && {
        ...getErrorRecovery(apiError, client),
        data: { httpStatus: apiError.status },
      }),
    },
    exitCode
  );
}

export interface DaemonInstance {
  id: string;
  region: string;
  startedAt: string;
  alive?: boolean;
  image?: string;
  lastCheckedAt?: string;
  memoryMiB?: number;
  stoppedAt?: string;
}

export interface Daemon {
  name: string;
  status: string;
  updatedAt: string;
  deploymentId?: string;
  config?: {
    instances: number | Record<string, number>;
    configuredInstances?: number | Record<string, number>;
    image?: { requested: string; resolved: string };
    resources?: { requests: { memory: string } };
  };
  instances: { desired: number; ready: number; items: DaemonInstance[] };
}

type DaemonConfig = NonNullable<Daemon['config']>;

/**
 * A daemon from an API that still uses the `replicas` names.
 * Remove when vercel/api#100122 is deployed.
 */
interface LegacyDaemon extends Omit<Daemon, 'config' | 'instances'> {
  config?: Omit<DaemonConfig, 'instances' | 'configuredInstances'> & {
    replicas: DaemonConfig['instances'];
    configuredReplicas?: DaemonConfig['configuredInstances'];
  };
  replicas: Daemon['instances'];
}

function toDaemon(daemon: Daemon | LegacyDaemon): Daemon {
  if (!('replicas' in daemon)) return daemon;
  const { replicas: instances, config, ...rest } = daemon;
  if (!config) return { ...rest, instances };
  const { replicas, configuredReplicas, ...restConfig } = config;
  return {
    ...rest,
    config: {
      ...restConfig,
      instances: replicas,
      configuredInstances: configuredReplicas,
    },
    instances,
  };
}

export const DAEMON_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Returns the one instance ID in `args`, or reports a usage error. */
export function instanceIdArg(client: Client, args: string[], usage: string) {
  if (args.length === 0) {
    return failure(
      client,
      AGENT_REASON.INVALID_ARGUMENTS,
      'An instance ID is required.',
      { command: 'instances list', when: 'List available instances' },
      2
    );
  }
  if (args.length === 1 && /^dmni_[0-9a-hjkmnp-tv-z]{26}$/.test(args[0])) {
    return args[0];
  }
  const message =
    'Expected one instance ID, like dmni_01k7d0q5w3x8y9z0a1b2c3d4e5.';
  return usageError(client, message, usage);
}

/** Parses a subcommand's argv, tracks its options, and resolves JSON mode. */
export function parse<T extends ReadonlyArray<CommandOption>>(
  client: Client,
  argv: string[],
  options: T,
  usage: string
) {
  let parsed;
  try {
    const spec = getFlagsSpecification(options);
    parsed = parseArguments(argv, spec as typeof spec & arg.Spec);
  } catch (err) {
    return reportError(client, err, 2);
  }
  const telemetry = new DaemonsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  telemetry.trackOptions(parsed.flags);
  const format = validateJsonOutput(parsed.flags as { '--json'?: boolean });
  if (!format.valid) return usageError(client, format.error, usage);
  const asJson = format.jsonOutput || client.nonInteractive;
  return { ...parsed, asJson, telemetry };
}

/** Resolves the linked or `--project` project. Never links or creates one. */
export async function resolveProject(client: Client, project?: string) {
  const link = isJsonOutput(client)
    ? await resolveProjectContext({
        client,
        projectNameOrId: project,
        projectNotFoundHandling: 'return',
        quiet: true,
      })
    : await requireProjectContext(client, 'daemons', project);
  if (typeof link === 'number') return link;
  if (link.status === 'error') {
    return reportError(
      client,
      new Error('Could not resolve project context.'),
      link.exitCode
    );
  }
  if (link.status !== 'linked') {
    return failure(
      client,
      project ? AGENT_REASON.PROJECT_NOT_FOUND : AGENT_REASON.NOT_LINKED,
      project
        ? `Couldn't find project ${project}.`
        : 'No linked project found.',
      {
        command: 'list --project <PROJECT>',
        when: 'Select an existing project',
      }
    );
  }
  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;
  return { ...link, target: `${link.org.slug}/${link.project.name}` };
}

/** A runnable `vercel daemons …` command that keeps the run's global flags. */
export function daemonsCommand(client: Client, command: string): string {
  return withGlobalFlags(client, `daemons ${command}`, {
    preserveProject: true,
  });
}

/** Reports a failure with one next step and returns its exit code. */
export function failure(
  client: Client,
  reason: string,
  message: string,
  next: { command: string; when: string },
  exitCode = 1
) {
  const command = daemonsCommand(client, next.command);
  output.stopSpinner();
  if (isJsonOutput(client)) {
    return writeJsonError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason,
        message,
        next: [{ ...next, command }],
      },
      exitCode
    );
  }
  output.fatal(message);
  output.print(`\n  ${next.when}:\n    ${cmd(command)}\n`);
  return exitCode;
}

/** Reports invalid input before any request and returns exit code 2. */
export function usageError(client: Client, message: string, usage: string) {
  const next = { command: usage, when: 'Usage' };
  return failure(client, AGENT_REASON.INVALID_ARGUMENTS, message, next, 2);
}

export function printJson(client: Client, value: unknown) {
  client.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  return 0;
}

export function formatAge(date: string): string {
  return `${ms(Math.max(0, Date.now() - Date.parse(date)))} ago`;
}

export function formatInstanceState(instance: DaemonInstance): string {
  if (instance.stoppedAt) return 'Stopped';
  return instance.alive ? 'Alive' : 'Not alive';
}

export function formatStatus(status: string): string {
  const state = status.toLowerCase();
  const tone =
    state === 'ready' || state === 'alive'
      ? 'success'
      : state === 'reconciling'
        ? 'pending'
        : state === 'not alive'
          ? 'error'
          : 'muted';
  const label = `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
  return output.formatStatus(label, tone);
}

/** Renders a stdout table with dim Title Case headers. */
export function formatTable(
  headers: string[],
  rows: string[][],
  hsep = 3
): string {
  return table([headers.map(header => chalk.dim(header)), ...rows], {
    hsep,
  })
    .split('\n')
    .map(line => `  ${line}`.trimEnd())
    .join('\n');
}

export function daemonsPath(project: Project, ...segments: string[]): string {
  const base = `/v1/projects/${encodeURIComponent(project.id)}/daemons`;
  return [base, ...segments.map(encodeURIComponent)].join('/');
}

/** Lists production daemons, the only supported scope for now. */
export async function fetchDaemonsPage(
  client: Client,
  project: Project,
  opts: { limit?: number; next?: string }
): Promise<{ daemons: Daemon[]; pagination: { next?: string } }> {
  const query = new URLSearchParams({
    scopeType: 'target',
    scopeValue: 'production',
  });
  if (opts.limit !== undefined) query.set('limit', String(opts.limit));
  if (opts.next) query.set('cursor', opts.next);
  const page = await client.fetch<{
    daemons: Array<Daemon | LegacyDaemon>;
    pagination: { next?: string };
  }>(`${daemonsPath(project)}?${query}`, { accountId: project.accountId });
  return { ...page, daemons: page.daemons.map(toDaemon) };
}

export async function fetchAllDaemons(client: Client, project: Project) {
  const daemons: Daemon[] = [];
  let next: string | undefined;
  do {
    const page = await fetchDaemonsPage(client, project, { limit: 100, next });
    daemons.push(...page.daemons);
    next = page.pagination.next;
  } while (next);
  return daemons;
}

/** Finds a running instance and the daemon that owns it. */
export async function findInstance(
  client: Client,
  link: { project: Project; target: string },
  instanceId: string
) {
  for (const daemon of await fetchAllDaemons(client, link.project)) {
    const item = daemon.instances.items.find(({ id }) => id === instanceId);
    if (item) return { ...item, daemon: daemon.name };
  }
  return failure(
    client,
    AGENT_REASON.NOT_FOUND,
    `Couldn't find running production instance ${instanceId} in ${link.target}.`,
    { command: 'instances list', when: 'See the running instances' }
  );
}
