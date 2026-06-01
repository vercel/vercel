import open from 'open';
import type Client from '../../util/client';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import type { ProjectLinkResult } from '@vercel-internals/types';
import getTeamById from '../../util/teams/get-team-by-id';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../util/errors-ts';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { help } from '../help';
import { getSubcommand, tracesCommand } from './command';
import { fetchTrace } from './fetch-trace';
import { renderMarkdown } from './render-markdown';
import { resolveScope } from './scope-resolver';
import type { TracesTelemetryClient } from '../../util/telemetry/commands/traces';

const VIEW_OPTIONS = ['timeline', 'tree', 'gantt'] as const;
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
  projectFlag,
  teamId,
  linkedProject,
}: {
  client: Client;
  scopeFlag: string | undefined;
  projectFlag: string | undefined;
  teamId: string;
  linkedProject: ProjectLinkResult;
}): Promise<
  { teamSlug: string; projectName: string } | { error: string; reason: string }
> {
  let teamSlug: string;
  if (scopeFlag) {
    // Team ids start with `team_`; anything else is already a slug.
    if (scopeFlag.startsWith('team_')) {
      const team = await getTeamById(client, scopeFlag);
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

  let projectName: string;
  if (projectFlag) {
    const project = await getProjectByNameOrId(client, projectFlag, teamId);
    if (project instanceof ProjectNotFound) {
      return {
        error: `Project not found: ${projectFlag}`,
        reason: AGENT_REASON.NOT_FOUND,
      };
    }
    projectName = project.name;
  } else if (linkedProject.status === 'linked') {
    projectName = linkedProject.project.name;
  } else {
    return {
      error: 'Unable to resolve project name for the dashboard URL.',
      reason: AGENT_REASON.NOT_LINKED,
    };
  }

  return { teamSlug, projectName };
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
    return 1;
  }

  const positional = parsedArgs.args.slice(1);
  const requestId =
    positional[0] === getSubcommand.name ? positional[1] : positional[0];
  const json = parsedArgs.flags['--json'];
  const scopeFlag = parsedArgs.flags['--scope'];
  const projectFlag = parsedArgs.flags['--project'];
  const openFlag = parsedArgs.flags['--open'];
  const viewFlag = parsedArgs.flags['--view'];

  telemetry.trackCliArgumentRequestId(requestId);
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
    return 1;
  }

  if (viewFlag && !openFlag) {
    const msg = '`--view` can only be used with `--open`.';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: msg,
      });
    }
    output.error(msg);
    return 1;
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
      return 1;
    }
    view = viewFlag;
  }

  if (!requestId) {
    output.print(
      help(getSubcommand, {
        parent: tracesCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  let teamId: string;
  let projectId: string;
  let linkedProject: ProjectLinkResult | undefined;
  if (scopeFlag && projectFlag && !openFlag) {
    teamId = scopeFlag;
    projectId = projectFlag;
  } else {
    linkedProject = await getLinkedProject(client);
    if (linkedProject.status === 'error') {
      if (scopeFlag && projectFlag) {
        // Both flags were provided so we can proceed without a linked project.
        linkedProject = { status: 'not_linked', org: null, project: null };
      } else {
        return linkedProject.exitCode;
      }
    }
    const scope = resolveScope({
      flags: { scope: scopeFlag, project: projectFlag },
      linkedProject,
    });
    if ('message' in scope) {
      output.error(scope.message);
      return 1;
    }
    teamId = scope.teamId;
    projectId = scope.projectId;
  }

  output.spinner('Fetching trace…');
  let trace;
  try {
    ({ trace } = await fetchTrace({
      client,
      teamId,
      projectId,
      requestId,
    }));
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }
  output.stopSpinner();

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
      projectFlag,
      teamId,
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

  client.stdout.write(renderMarkdown(trace, { requestId }));
  output.log('Run with --json for full trace data.');
  return 0;
}
