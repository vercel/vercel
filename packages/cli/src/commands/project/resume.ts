import chalk from 'chalk';
import plural from 'pluralize';
import Sema from 'async-sema';
import type Client from '../../util/client';
import type { Project } from '@vercel-internals/types';
import output from '../../output-manager';
import stamp from '../../util/output/stamp';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import {
  isAPIError,
  ProjectNotFound,
  LinkRequiredError,
} from '../../util/errors-ts';
import { validateJsonOutput } from '../../util/output-format';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import {
  listPausedProjects,
  PAUSED_PROJECTS_INCOMPLETE,
} from '../../util/projects/list-paused-projects';
import { getContextName } from '../../util/get-scope';
import { isTeamExplicit } from '../../util/teams/is-team-explicit';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import joinWords from '../../util/output/join-words';
import { ProjectResumeTelemetryClient } from '../../util/telemetry/commands/project/resume';
import { resumeSubcommand } from './command';
import {
  type ActionRequiredPayload,
  buildCommandWithGlobalFlags,
  buildCommandWithYes,
  outputActionRequired,
  outputAgentError,
  shouldEmitNonInteractiveCommandError,
} from '../../util/agent-output';
import { canPrompt } from '../../util/can-prompt';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';

export default async function resume(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new ProjectResumeTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(resumeSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: error instanceof Error ? error.message : String(error),
    });
    printError(error);
    return 2;
  }
  const { args, flags } = parsedArgs;

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: formatResult.error,
    });
    output.error(formatResult.error);
    return 2;
  }

  const { jsonOutput } = formatResult;
  const asJson = jsonOutput || !canPrompt(client);

  function fail(
    reason: string,
    message: string,
    humanMessage: string = message,
    exitCode = 1
  ): number {
    if (shouldEmitNonInteractiveCommandError(client)) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason,
          message,
        },
        exitCode
      );
      return exitCode;
    }
    if (jsonOutput || !canPrompt(client)) {
      client.stdout.write(
        `${JSON.stringify(
          { status: AGENT_STATUS.ERROR, reason, message },
          null,
          2
        )}\n`
      );
      return exitCode;
    }
    output.error(humanMessage);
    return exitCode;
  }

  const all = flags['--all'] ?? false;
  const yes = flags['--yes'] ?? false;
  if (all && args.length > 0) {
    return fail(
      AGENT_REASON.INVALID_ARGUMENTS,
      `Use either project names or --all, not both. Usage: ${getCommandName(
        'project resume [project ...] | --all'
      )}`,
      `Use either project names or --all, not both. Usage: ${chalk.cyan(
        getCommandName('project resume [project ...] | --all')
      )}`,
      2
    );
  }

  telemetry.trackCliArgumentProject(args);
  telemetry.trackCliFlagAll(all);
  telemetry.trackCliFlagYes(yes);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  const names = [...new Set(args)];
  if (all || names.length > 1) {
    return resumeMany(client, { all, names, yes, jsonOutput, fail });
  }

  let project: Project;
  try {
    project = await getProjectByCwdOrLink({
      client,
      commandName: 'project resume',
      projectNameOrId: names[0],
      forReadOnlyCommand: true,
    });
  } catch (error) {
    return fail(
      error instanceof ProjectNotFound
        ? AGENT_REASON.PROJECT_NOT_FOUND
        : error instanceof LinkRequiredError
          ? AGENT_REASON.NOT_LINKED
          : AGENT_REASON.API_ERROR,
      error instanceof Error ? error.message : String(error)
    );
  }

  const resumeStamp = stamp();
  try {
    await client.fetch(
      `/v1/projects/${encodeURIComponent(project.id)}/unpause`,
      {
        method: 'POST',
      }
    );
  } catch (err: unknown) {
    if (isAPIError(err)) {
      if (err.status === 404) {
        return fail(AGENT_REASON.NOT_FOUND, 'Project not found.');
      }
      if (err.status === 403) {
        return fail(
          'forbidden',
          err.serverMessage ||
            'You do not have permission to resume this project.'
        );
      }
    }
    return fail(
      AGENT_REASON.API_ERROR,
      err instanceof Error ? err.message : String(err)
    );
  }

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        { id: project.id, name: project.name, paused: false },
        null,
        2
      )}\n`
    );
    return 0;
  }

  output.success(
    `Production traffic for ${chalk.bold(project.name)} resumed ${chalk.gray(
      resumeStamp()
    )}`
  );
  return 0;
}

type Fail = (
  reason: string,
  message: string,
  humanMessage?: string,
  exitCode?: number
) => number;

interface ResumeResult {
  id: string;
  name: string;
  outcome: 'resumed' | 'unchanged' | 'failed' | 'unknown';
  error?: { code: string; message: string };
}

/** Project names shown in a preview or receipt before "and N more". */
const LISTED_PROJECTS = 5;

/** Team slugs that are safe to put in a suggested command. */
const TEAM_SLUG = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Unpause requests in flight at once. Unpausing is idempotent, and the client
 * waits out rate limits, so a few at a time is safe.
 */
const UNPAUSE_CONCURRENCY = 5;

/** Statuses from the proxy in front of the API: the request may have run. */
const GATEWAY_STATUSES = new Set([502, 503, 504]);

/**
 * Resumes several projects: every paused project in the team with `--all`, or
 * the projects named in argv. Acting on many projects needs consent: a prompt
 * in a terminal, or `--yes` without one. `--all --yes` also needs the team to
 * be named, so a saved team or a link can't point it at the wrong team.
 */
async function resumeMany(
  client: Client,
  opts: {
    all: boolean;
    names: string[];
    yes: boolean;
    jsonOutput: boolean;
    fail: Fail;
  }
): Promise<number> {
  const { all, names, yes, jsonOutput, fail } = opts;
  const asJson = jsonOutput || !canPrompt(client);
  const interactive = canPrompt(client) && !jsonOutput;

  // Resolve every target before changing anything. Named projects are looked
  // up in the selected team, like `project resume <name>`. `--all` names none,
  // so like `project resume` with no name it follows the linked folder, which
  // is also the team `project list` shows.
  let contextName: string;
  let teamNamed: boolean;
  try {
    contextName = await getContextName(client, { resolveLocalScope: all });
    teamNamed = !all || (await isTeamExplicit(client));
  } catch (err: unknown) {
    return fail(
      AGENT_REASON.API_ERROR,
      err instanceof Error ? err.message : String(err)
    );
  }
  // Without a terminal, `--all --yes` needs the team named. Say so before
  // reading every page of projects.
  if (all && yes && !teamNamed && !interactive) {
    return refuse(client, {
      reason: AGENT_REASON.MISSING_SCOPE,
      message:
        "Can't resume every paused project without a team in non-interactive mode.",
      command: `${buildCommandWithYes(client.argv)} --scope <TEAM>`,
      when: 'Replace <TEAM> with the team whose paused projects to resume',
      hint: 'Ask the user which team to resume, then run the command in next[]. Do not choose a team yourself.',
    });
  }

  let projects: Project[];
  let incomplete = false;
  try {
    if (all) {
      if (!asJson) {
        output.spinner(`Finding paused projects in ${chalk.bold(contextName)}`);
      }
      ({ projects, incomplete } = await listPausedProjects(client));
    } else {
      const found = await Promise.all(
        names.map(name => getProjectByNameOrId(client, name))
      );
      const missing = names.filter(
        (_, i) => found[i] instanceof ProjectNotFound
      );
      if (missing.length > 0) {
        return fail(
          AGENT_REASON.PROJECT_NOT_FOUND,
          missing.length === 1
            ? new ProjectNotFound(missing[0]).message
            : `There are no projects for ${joinWords(
                missing.map(name => `"${name}"`)
              )}`
        );
      }
      // A name and an ID can point at the same project.
      projects = [
        ...new Map(
          (found as Project[]).map(project => [project.id, project])
        ).values(),
      ];
    }
  } catch (err: unknown) {
    return fail(
      AGENT_REASON.API_ERROR,
      err instanceof Error ? err.message : String(err)
    );
  } finally {
    output.stopSpinner();
  }

  const paused = projects.filter(project => project.paused);
  const unchanged = projects.filter(project => !project.paused);

  // Suggested commands name the team, since a later run in the same folder
  // could pick another one.
  const team = TEAM_SLUG.test(contextName) ? contextName : '<TEAM>';
  const scope = team === '<TEAM>' ? '' : ` --scope ${team}`;
  const suggest = (command: string) =>
    buildCommandWithGlobalFlags(client.argv, `${command}${scope}`, undefined, {
      // `--team` is the old name of `--scope`, so keep only one.
      excludeFlags: scope ? ['--team'] : [],
    });
  // Resumed projects drop out of the group the scan couldn't finish, so
  // running `--all` again reaches the rest.
  const rerun = incomplete ? suggest('project resume --all') : undefined;

  if (paused.length === 0) {
    if (asJson) {
      writeResults(
        client,
        projects.map(toUnchangedResult),
        incomplete,
        rerun ? { command: rerun, when: RERUN_WHEN } : undefined
      );
      return incomplete ? 1 : 0;
    }
    output.print(
      all
        ? `  No paused projects in ${chalk.bold(contextName)}.\n`
        : `  Nothing to resume. ${formatNames(unchanged)} ${
            unchanged.length === 1 ? "isn't" : "aren't"
          } paused.\n`
    );
    if (incomplete) {
      output.warning(PAUSED_PROJECTS_INCOMPLETE);
      return 1;
    }
    return 0;
  }

  const count = plural('project', paused.length, true);
  // One named project is an ordinary resume, like `project resume <name>`.
  // `--all` picks its targets itself, so it always shows them first. In a
  // terminal, `--all --yes` without a named team still asks, since the team
  // came from the link or the saved team.
  const needsConsent = all || paused.length > 1;
  if (needsConsent && !(yes && teamNamed)) {
    if (interactive) {
      printAlignedLabel('Team', contextName);
      if (all) {
        printAlignedLabel('Projects', formatNames(paused));
      }
      if (unchanged.length > 0) {
        printAlignedLabel('Not paused', formatNames(unchanged));
      }
      output.print('\n');
      const confirmed = await client.input.confirm(
        `Resume production traffic for ${count}?`,
        false
      );
      if (!confirmed) {
        output.print('  Canceled. Nothing was changed.\n');
        return 130;
      }
    } else {
      // The person approving sees the team, so name it when it's safe to.
      return refuse(client, {
        reason: AGENT_REASON.CONFIRMATION_REQUIRED,
        message: `Can't resume ${count} without --yes in non-interactive mode.`,
        command: `${buildCommandWithYes(client.argv)}${
          teamNamed ? '' : ` --scope ${team}`
        }`,
        when: `Only after a human approves resuming production traffic for ${count}${
          team === '<TEAM>' ? '. Replace <TEAM> with the team' : ` in ${team}`
        }`,
        userActionRequired: true,
        hint: 'Show the user the projects in data.projects and run the command in next[] only after they approve.',
        data: {
          team: contextName,
          effects: [`Resumes production traffic for ${count}.`],
          projects: paused.map(({ id, name }) => ({ id, name })),
        },
      });
    }
  }

  // Unpausing is idempotent, so one failure doesn't stop the rest, and
  // retrying is safe.
  const resumeStamp = stamp();
  const sema = new Sema(UNPAUSE_CONCURRENCY);
  let done = 0;
  if (!asJson) {
    output.spinner(`Resuming ${count}`);
  }
  const results = await Promise.all(
    projects.map(async (project): Promise<ResumeResult> => {
      if (!project.paused) {
        return toUnchangedResult(project);
      }
      await sema.acquire();
      try {
        await client.fetch(
          `/v1/projects/${encodeURIComponent(project.id)}/unpause`,
          { method: 'POST' }
        );
        return { id: project.id, name: project.name, outcome: 'resumed' };
      } catch (err: unknown) {
        return { id: project.id, name: project.name, ...toFailure(err) };
      } finally {
        sema.release();
        if (!asJson) {
          output.spinner(`Resuming ${count} (${++done} done)`);
        }
      }
    })
  );
  output.stopSpinner();

  const notResumed = results.filter(
    result => result.outcome === 'failed' || result.outcome === 'unknown'
  );
  const retry =
    notResumed.length > 0
      ? suggest(
          `project resume ${notResumed.map(result => result.id).join(' ')}${
            notResumed.length > 1 ? ' --yes' : ''
          }`
        )
      : undefined;
  if (asJson) {
    // Running `--all` again also retries the ones that didn't resume.
    let next: { command: string; when: string } | undefined;
    if (rerun) {
      next = { command: rerun, when: RERUN_WHEN };
    } else if (retry) {
      next = { command: retry, when: RETRY_WHEN };
    }
    writeResults(client, results, incomplete, next);
    return notResumed.length > 0 || incomplete ? 1 : 0;
  }

  if (notResumed.length === 0) {
    // Possibly partial work gets no ✓.
    printAlignedLabel('Resumed', `${count} ${chalk.gray(resumeStamp())}`, {
      gutter: incomplete ? undefined : '✓',
    });
    if (unchanged.length > 0) {
      printAlignedLabel('Not paused', formatNames(unchanged));
    }
  } else {
    const failed = notResumed.filter(result => result.outcome === 'failed');
    const unknown = notResumed.length - failed.length;
    output.fatal(
      [
        `Resumed ${paused.length - notResumed.length} of ${count}.`,
        failed.length > 0 && `${failed.length} failed.`,
        unknown > 0 && `${unknown} unknown.`,
      ]
        .filter(Boolean)
        .join(' ')
    );
    for (const result of notResumed) {
      printAlignedLabel(result.name, result.error!.message);
    }
  }

  if (rerun) {
    // Running `--all` again also retries the ones that didn't resume.
    output.warning(PAUSED_PROJECTS_INCOMPLETE);
    output.print(`\n  Run this again to resume the rest:\n    ${rerun}\n`);
    return 1;
  }
  if (!retry) {
    return 0;
  }
  output.print(
    `\n  Resuming again is safe. Retry the ones that didn't resume:\n    ${retry}\n`
  );
  return 1;
}

function toUnchangedResult(project: Project): ResumeResult {
  return { id: project.id, name: project.name, outcome: 'unchanged' };
}

/**
 * A failed unpause. Without an answer from the API, which includes an error
 * from the proxy in front of it, the project may have resumed anyway.
 */
function toFailure(err: unknown): Pick<ResumeResult, 'outcome' | 'error'> {
  if (isAPIError(err) && !GATEWAY_STATUSES.has(err.status)) {
    if (err.status === 404) {
      return {
        outcome: 'failed',
        error: { code: AGENT_REASON.NOT_FOUND, message: 'Project not found.' },
      };
    }
    if (err.status === 403) {
      return {
        outcome: 'failed',
        error: {
          code: 'forbidden',
          message:
            err.serverMessage ||
            'You do not have permission to resume this project.',
        },
      };
    }
    return {
      outcome: 'failed',
      error: { code: err.code || AGENT_REASON.API_ERROR, message: err.message },
    };
  }
  return {
    outcome: 'unknown',
    error: {
      code: AGENT_REASON.UNKNOWN_OUTCOME,
      message: `Couldn't confirm it resumed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    },
  };
}

const RERUN_WHEN = 'To resume paused projects this run may have missed';
const RETRY_WHEN =
  "To retry the projects that didn't resume. Resuming again is safe.";

function writeResults(
  client: Client,
  results: ResumeResult[],
  incomplete: boolean,
  next?: { command: string; when: string }
) {
  const count = (outcome: ResumeResult['outcome']) =>
    results.filter(result => result.outcome === outcome).length;
  client.stdout.write(
    `${JSON.stringify(
      {
        results,
        summary: {
          succeeded: count('resumed'),
          failed: count('failed'),
          skipped: count('unchanged'),
          unknown: count('unknown'),
        },
        ...(incomplete && {
          warnings: [
            {
              reason: AGENT_REASON.INCOMPLETE_RESULTS,
              message: PAUSED_PROJECTS_INCOMPLETE,
            },
          ],
        }),
        ...(next && { next: [next] }),
      },
      null,
      2
    )}\n`
  );
}

/** Up to five project names, then how many more. */
function formatNames(projects: Project[]): string {
  const names = projects.slice(0, LISTED_PROJECTS).map(project => project.name);
  const more = projects.length - names.length;
  return more > 0 ? `${names.join(', ')} and ${more} more` : joinWords(names);
}

/**
 * Stops for input the command needs before it can act (`--yes`, a team).
 * Exits 2, since adding that input to the command makes it work.
 */
function refuse(
  client: Client,
  opts: {
    reason: string;
    message: string;
    command: string;
    when: string;
    hint: string;
    userActionRequired?: boolean;
    data?: Record<string, unknown>;
  }
): number {
  const payload: ActionRequiredPayload = {
    status: AGENT_STATUS.ACTION_REQUIRED,
    reason: opts.reason,
    message: opts.message,
    userActionRequired: opts.userActionRequired,
    hint: opts.hint,
    next: [{ command: opts.command, when: opts.when }],
    data: opts.data,
  };
  if (shouldEmitNonInteractiveCommandError(client)) {
    outputActionRequired(client, payload, 2);
    return 2;
  }
  client.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  return 2;
}
