import chalk from 'chalk';
import open from 'open';
import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { getLinkedProject } from '../../util/projects/link';
import type { ProjectLinkResult } from '@vercel-internals/types';
import getTeamByIdOrSlug from '../../util/teams/get-team-by-id-or-slug';
import { outputAgentError, writeAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { help } from '../help';
import { getSubcommand, tracesCommand } from './command';
import { fetchTrace } from './fetch-trace';
import { resolveRootSpan } from './analyze';
import { addSpanQueryIssueDetails } from './query';
import { renderMarkdown } from './render-markdown';
import { renderWaterfall } from './render-waterfall';
import { resolveScope } from './scope-resolver';
import type { TracesTelemetryClient } from '../../util/telemetry/commands/traces';

const VIEW_OPTIONS = ['timeline', 'tree', 'waterfall'] as const;
type View = (typeof VIEW_OPTIONS)[number];

function isView(value: string): value is View {
  return (VIEW_OPTIONS as readonly string[]).includes(value);
}

function buildDashboardUrl({
  teamSlug,
  projectName,
  traceId,
  view,
}: {
  teamSlug: string;
  projectName: string;
  traceId: string;
  view: View | undefined;
}): string {
  const base = `https://vercel.com/${encodeURIComponent(teamSlug)}/${encodeURIComponent(projectName)}/logs/traces/${encodeURIComponent(traceId)}`;
  // Omit `?view=` for the dashboard default to let the dashboard own it.
  if (view && view !== 'timeline') {
    return `${base}?view=${encodeURIComponent(view)}`;
  }
  return base;
}

async function resolveDashboardScope({
  client,
  scopeFlag,
  projectName,
  linkedProject,
}: {
  client: Client;
  scopeFlag: string | undefined;
  projectName: string;
  linkedProject: ProjectLinkResult;
}): Promise<
  { teamSlug: string; projectName: string } | { error: string; reason: string }
> {
  let teamSlug: string;
  if (scopeFlag) {
    // Team ids start with `team_`; anything else is already a slug.
    if (scopeFlag.startsWith('team_')) {
      const team = await getTeamByIdOrSlug(client, scopeFlag);
      teamSlug = team.slug;
    } else {
      teamSlug = scopeFlag;
    }
  } else if (linkedProject.status === 'linked') {
    teamSlug = linkedProject.org.slug;
  } else {
    return {
      error: 'Unable to resolve team slug for the dashboard URL.',
      reason: AGENT_REASON.NOT_LINKED,
    };
  }

  return { teamSlug, projectName };
}

const RETENTION_HINT =
  'Traces are kept for 1 hour on Hobby, 1 day on Pro, and 3 days on Enterprise.';

/**
 * Adds the API's validation reason to a failed lookup, so a 400 says why
 * (for example, a request ID outside the retention window) instead of only
 * "Invalid trace request".
 */
function addTraceErrorDetails(err: unknown): void {
  addSpanQueryIssueDetails(err);
  if (
    isAPIError(err) &&
    err.status === 400 &&
    /retention window/i.test(err.serverMessage)
  ) {
    err.serverMessage = `${err.serverMessage}. ${RETENTION_HINT}`;
    err.message = `${err.serverMessage} (${err.status})`;
  }
}

export default async function get(
  client: Client,
  telemetry: TracesTelemetryClient
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(getSubcommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 2;
  }

  const positional = parsedArgs.args.slice(1);
  const subcommandNames: readonly string[] = [
    getSubcommand.name,
    ...getSubcommand.aliases,
  ];
  const identifiers = subcommandNames.includes(positional[0])
    ? positional.slice(1)
    : positional;
  const id = identifiers[0];
  const isTraceId = id !== undefined && /^[a-fA-F0-9]{32}$/.test(id);
  const json = parsedArgs.flags['--json'];
  const scopeFlag = parsedArgs.flags['--scope']?.trim() || undefined;
  const projectFlag = parsedArgs.flags['--project'];
  const openFlag = parsedArgs.flags['--open'];
  const viewFlag = parsedArgs.flags['--view'];

  telemetry.trackCliArgumentId(id, isTraceId ? 'traceId' : 'requestId');
  telemetry.trackCliFlagJson(json);
  telemetry.trackCliOptionProject(projectFlag);
  telemetry.trackCliFlagOpen(openFlag);
  telemetry.trackCliOptionView(viewFlag);

  if (json && openFlag) {
    const msg = '`--json` and `--open` cannot be used together.';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: msg,
      });
    }
    output.error(msg);
    return 2;
  }

  // Without --open, only the waterfall has a terminal rendering.
  if (viewFlag && !openFlag && viewFlag !== 'waterfall') {
    const msg =
      '`--view` can only be used with `--open`, except `--view waterfall`, which draws the chart in the terminal.';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: msg,
      });
    }
    output.error(msg);
    return 2;
  }

  if (viewFlag && json) {
    const msg = '`--json` and `--view` cannot be used together.';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: msg,
      });
    }
    output.error(msg);
    return 2;
  }

  let view: View | undefined;
  if (viewFlag !== undefined) {
    if (!isView(viewFlag)) {
      const msg = `\`--view\` must be one of: ${VIEW_OPTIONS.join(', ')}. Received: ${viewFlag}`;
      if (client.nonInteractive) {
        outputAgentError(client, {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: msg,
        });
      }
      output.error(msg);
      return 2;
    }
    view = viewFlag;
  }

  if (!id) {
    output.print(
      help(getSubcommand, {
        stream: client.stderr,
        parent: tracesCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  if (identifiers.length > 1) {
    const msg = 'Provide one trace ID or request ID.';
    if (client.nonInteractive) {
      writeAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: msg,
      });
    }
    output.fatal(msg);
    return 2;
  }

  const target = isTraceId ? { traceId: id.toLowerCase() } : { requestId: id };

  let teamId: string;
  let projectId: string;
  let linkedProject: ProjectLinkResult | undefined;
  linkedProject = await getLinkedProject(client);
  if (linkedProject.status === 'error') {
    if (scopeFlag && projectFlag) {
      // Both flags were provided so we can proceed without a linked project.
      linkedProject = { status: 'not_linked', org: null, project: null };
    } else {
      return linkedProject.exitCode;
    }
  }
  let scope: Awaited<ReturnType<typeof resolveScope>>;
  try {
    scope = await resolveScope({
      client,
      flags: { scope: scopeFlag, project: projectFlag },
      linkedProject,
    });
  } catch (err) {
    printError(err);
    return 1;
  }
  if ('message' in scope) {
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason: scope.reason,
        message: scope.message,
      });
    }
    output.error(scope.message);
    return 1;
  }
  teamId = scope.teamId;
  projectId = scope.projectId;

  output.spinner('Fetching trace…');
  let trace;
  let partial;
  try {
    ({ trace, partial } = await fetchTrace({
      client,
      teamId,
      projectId,
      ...target,
    }));
  } catch (err) {
    output.stopSpinner();
    addTraceErrorDetails(err);
    printError(err);
    return 1;
  }
  output.stopSpinner();
  const rootRequestId =
    resolveRootSpan(trace)?.attributes?.['vercel.request_id'];
  const requestId =
    target.requestId ??
    (typeof rootRequestId === 'string' && rootRequestId.trim() !== ''
      ? rootRequestId
      : undefined);
  // The rendered summaries say this on stdout, where agents read it. JSON
  // and the browser have no room for it, so they keep the stderr warning.
  if (partial && (json || openFlag)) {
    output.warn('Trace is incomplete because it exceeded the span limit.');
  }

  if (openFlag) {
    if (!linkedProject) {
      // Should be unreachable: the open path forces linkedProject resolution above.
      const msg = 'Unable to resolve project link for the dashboard URL.';
      if (client.nonInteractive) {
        outputAgentError(client, {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.NOT_LINKED,
          message: msg,
        });
      }
      output.error(msg);
      return 1;
    }
    const resolved = await resolveDashboardScope({
      client,
      scopeFlag,
      projectName: scope.projectName,
      linkedProject,
    });
    if ('error' in resolved) {
      if (client.nonInteractive) {
        outputAgentError(client, {
          status: AGENT_STATUS.ERROR,
          reason: resolved.reason,
          message: resolved.error,
        });
      }
      output.error(resolved.error);
      return 1;
    }
    const url = buildDashboardUrl({
      teamSlug: resolved.teamSlug,
      projectName: resolved.projectName,
      traceId: trace.traceId,
      view,
    });
    output.log(`Opening ${url} in your browser...`);
    await open(url);
    return 0;
  }

  if (json) {
    client.stdout.write(`${JSON.stringify(trace, null, 2)}\n`);
    return 0;
  }

  // Markdown is the default for everyone: it's easy to parse and quote, and
  // agents read structured text better than charts. The waterfall is opt-in.
  client.stdout.write(
    view === 'waterfall'
      ? renderWaterfall(trace, {
          requestId,
          partial,
          columns: client.stdout.columns,
        })
      : renderMarkdown(trace, { requestId, partial })
  );
  try {
    const resolved = await resolveDashboardScope({
      client,
      scopeFlag,
      projectName: scope.projectName,
      linkedProject,
    });
    if ('error' in resolved) {
      output.warn(resolved.error);
    } else {
      const url = buildDashboardUrl({
        ...resolved,
        traceId: trace.traceId,
        view,
      });
      output.log(`View trace: ${url}`);
    }
  } catch (err) {
    output.print(
      `${chalk.yellow('!')} Failed to resolve the dashboard URL. Use --open to retry.\n`
    );
    output.debug(String(err));
  }
  output.log('Run with --json for full trace data.');
  return 0;
}
