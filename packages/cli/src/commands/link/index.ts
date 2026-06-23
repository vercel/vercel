import type Client from '../../util/client';
import type {
  Org,
  Project,
  ProjectLinked,
  Team,
} from '@vercel-internals/types';
import chalk from 'chalk';
import { basename } from 'path';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import cmd from '../../util/output/cmd';
import setupAndLink from '../../util/link/setup-and-link';
import {
  addRepoLink,
  ensureRepoLink,
  linkRepoProject,
} from '../../util/link/repo';
import { type Command, help } from '../help';
import { addSubcommand, linkCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { LinkTelemetryClient } from '../../util/telemetry/commands/link';
import { getCommandAliases } from '..';
import getScope, { detectExplicitScope } from '../../util/get-scope';
import { isPromptCanceledError } from '../../util/input/prompt-cancellation';
import pull from '../env/pull';
import { resolveProjectCwd } from '../../util/projects/find-project-root';
import selectOrg from '../../util/input/select-org';
import getTeamById from '../../util/teams/get-team-by-id';
import getProjectByIdOrName from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../util/errors-ts';
import {
  getLinkedProject,
  linkFolderToProject,
} from '../../util/projects/link';
import searchProjectAcrossTeams, {
  type CrossTeamMatch,
} from '../../util/projects/search-project-across-teams';
import {
  argvHasNonInteractive,
  outputActionRequired,
  shouldEmitNonInteractiveCommandError,
} from '../../util/agent-output';
import { getCommandNamePlain } from '../../util/pkg-name';

const COMMAND_CONFIG = {
  add: getCommandAliases(addSubcommand),
};

function warnOidcRefreshFailed(): void {
  output.print(
    `${chalk.yellow('!')} Linked project, but failed to refresh VERCEL_OIDC_TOKEN in .env.local. Rerun the link command to retry.\n`
  );
}

async function refreshOidcTokenAfterLink(
  client: Client,
  cwd: string
): Promise<void> {
  const originalCwd = client.cwd;
  try {
    client.cwd = await resolveProjectCwd(cwd);
    output.print('\n');
    const exitCode = await pull(client, ['--yes'], 'vercel-cli:link', {
      oidcTokenOnly: true,
    });

    if (exitCode !== 0) {
      warnOidcRefreshFailed();
    }
  } catch (_error) {
    warnOidcRefreshFailed();
  } finally {
    client.cwd = originalCwd;
  }
}

function isNonInteractiveLink(client: Client): boolean {
  return (
    client.nonInteractive ||
    argvHasNonInteractive(client.argv) ||
    !client.stdin.isTTY
  );
}

async function getExplicitOrg(client: Client): Promise<{
  org: Org;
  team: Team | null;
}> {
  const scope = await getScope(client, { resolveLocalScope: true });
  return { org: scope.org, team: scope.team };
}

async function getRememberedExplicitTeam(client: Client): Promise<Team | null> {
  const { currentTeam, explicitCurrentTeam } = client.config;
  if (!currentTeam || explicitCurrentTeam !== currentTeam) {
    return null;
  }

  try {
    return await getTeamById(client, currentTeam);
  } catch (error) {
    output.debug(`Unable to load explicitly selected team: ${error}`);
    return null;
  }
}

function existingLinkMatches(
  link: ProjectLinked,
  org: Org | null,
  projectNameOrId?: string
): boolean {
  if (org && link.org.id !== org.id) {
    return false;
  }
  if (
    projectNameOrId &&
    link.project.id !== projectNameOrId &&
    link.project.name !== projectNameOrId
  ) {
    return false;
  }
  return true;
}

type LinkResolutionReason =
  | 'missing_scope'
  | 'missing_project'
  | 'ambiguous_project'
  | 'project_not_found';

function linkResolutionRequired(
  client: Client,
  reason: LinkResolutionReason,
  scopeSlug?: string,
  projectNameOrId?: string
): number {
  const scope = scopeSlug || '<team-slug>';
  const messages: Record<LinkResolutionReason, string> = {
    missing_scope:
      'No team could be determined with certainty in non-interactive mode. Provide --scope or select a team with `vercel switch`.',
    missing_project: scopeSlug
      ? `No exact Git-linked project was found under ${scopeSlug}. Provide --project explicitly.`
      : 'No project could be determined with certainty. Provide --project explicitly.',
    ambiguous_project: scopeSlug
      ? `Multiple Git-linked projects match this directory under ${scopeSlug}. Provide --project explicitly.`
      : 'Multiple projects match this directory. Provide --project explicitly.',
    project_not_found: projectNameOrId
      ? `Project "${projectNameOrId}" was not found under ${scope}.`
      : `The requested project was not found under ${scope}.`,
  };
  const next = [
    {
      command: getCommandNamePlain('teams list'),
      when: 'list available teams',
    },
    {
      command: getCommandNamePlain(`project list --scope ${scope}`),
      when: 'list existing projects in the team',
    },
    {
      command: getCommandNamePlain(
        `project add <project-name> --scope ${scope}`
      ),
      when: 'create a project explicitly',
    },
    {
      command: getCommandNamePlain(
        `link --scope ${scope} --project <project-name-or-id>`
      ),
      when: 'link an existing project explicitly',
    },
  ];

  if (shouldEmitNonInteractiveCommandError(client)) {
    outputActionRequired(
      client,
      {
        status: 'action_required',
        reason,
        message: messages[reason],
        next,
      },
      1
    );
    return 1;
  }

  output.error(
    `${messages[reason]}\n\n${next.map(item => `  ${item.command}`).join('\n')}`
  );
  return 1;
}

async function linkExistingProject(
  client: Client,
  cwd: string,
  org: Org,
  project: Project,
  match?: CrossTeamMatch
): Promise<ProjectLinked> {
  client.config.currentTeam = org.type === 'team' ? org.id : undefined;

  if (match?.reason === 'repo-root' && match.repo) {
    await linkRepoProject(client, cwd, {
      project,
      orgId: org.id,
      orgSlug: org.slug,
      remoteName: match.repo.remoteName,
      successEmoji: 'success',
    });
    return {
      status: 'linked',
      org,
      project,
      repoRoot: match.repo.rootPath,
    };
  }

  await linkFolderToProject(
    client,
    cwd,
    { projectId: project.id, orgId: org.id },
    project.name,
    org.slug,
    'success',
    true,
    false
  );
  return { status: 'linked', org, project };
}

async function findExactGitMatch(
  client: Client,
  cwd: string,
  team: Team
): Promise<CrossTeamMatch[]> {
  try {
    const result = await searchProjectAcrossTeams(client, basename(cwd), cwd, {
      teams: [team],
      skipLimited: false,
      nonInteractive: true,
    });
    return result.matches.filter(match => match.reason === 'repo-root');
  } catch (error) {
    output.debug(`Scoped Git project discovery failed: ${error}`);
    return [];
  }
}

async function linkNonInteractive(
  client: Client,
  cwd: string,
  explicitScopeProvided: boolean,
  projectNameOrId?: string
): Promise<ProjectLinked | number> {
  let selectedOrg: Org | null = null;
  let selectedTeam: Team | null = null;

  if (explicitScopeProvided) {
    const explicit = await getExplicitOrg(client);
    selectedOrg = explicit.org;
    selectedTeam = explicit.team;
  }

  // A fully explicit target must not be blocked by a stale local link. When
  // target information is incomplete, an existing owner/project pair is
  // authoritative evidence and can be reused.
  if (!explicitScopeProvided || !projectNameOrId) {
    // `getLinkedProject()` must never open a repo-project picker on a pipe.
    const originalNonInteractive = client.nonInteractive;
    client.nonInteractive = true;
    let existingLink;
    try {
      existingLink = await getLinkedProject(client, cwd);
    } finally {
      client.nonInteractive = originalNonInteractive;
    }

    if (existingLink.status === 'error') {
      return existingLink.exitCode;
    }
    if (
      existingLink.status === 'linked' &&
      existingLinkMatches(existingLink, selectedOrg, projectNameOrId)
    ) {
      return existingLink;
    }
  }

  if (!selectedOrg) {
    selectedTeam = await getRememberedExplicitTeam(client);
    if (selectedTeam) {
      selectedOrg = {
        type: 'team',
        id: selectedTeam.id,
        slug: selectedTeam.slug,
      };
    }
  }

  if (!selectedOrg) {
    return linkResolutionRequired(client, 'missing_scope');
  }

  if (projectNameOrId) {
    const project = await getProjectByIdOrName(
      client,
      projectNameOrId,
      selectedOrg.id
    );
    if (project instanceof ProjectNotFound) {
      return linkResolutionRequired(
        client,
        'project_not_found',
        selectedOrg.slug,
        projectNameOrId
      );
    }
    return await linkExistingProject(client, cwd, selectedOrg, project);
  }

  if (!selectedTeam) {
    return linkResolutionRequired(client, 'missing_project', selectedOrg.slug);
  }

  const matches = await findExactGitMatch(client, cwd, selectedTeam);
  if (matches.length === 0) {
    return linkResolutionRequired(client, 'missing_project', selectedOrg.slug);
  }
  if (matches.length > 1) {
    return linkResolutionRequired(
      client,
      'ambiguous_project',
      selectedOrg.slug
    );
  }

  const [match] = matches;
  return await linkExistingProject(
    client,
    cwd,
    selectedOrg,
    match.project,
    match
  );
}

export default async function link(client: Client) {
  try {
    return await client.withEscapePromptCancellation(() => linkProject(client));
  } catch (error) {
    if (isPromptCanceledError(error)) {
      output.print('  Canceled.\n');
      return 0;
    }
    throw error;
  }
}

async function linkProject(client: Client) {
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(linkCommand.options);

  // Parse CLI args (permissive to allow subcommand flags to pass through)
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  const { subcommand, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  const telemetry = new LinkTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: linkCommand, columns: client.stderr.columns })
    );
  }

  if (subcommand === 'add') {
    // `vc link add` subcommand
    // `--yes` is shared with the parent and already parsed by the permissive parse
    if (parsedArgs.flags['--help']) {
      telemetry.trackCliFlagHelp('link', subcommandOriginal);
      printHelp(addSubcommand);
      return 2;
    }

    telemetry.trackCliSubcommandAdd(subcommandOriginal);

    const yes = !!parsedArgs.flags['--yes'];

    try {
      await addRepoLink(client, client.cwd, { yes });
    } catch (err) {
      if (isPromptCanceledError(err)) {
        throw err;
      }
      output.prettyError(err);
      return 1;
    }

    return 0;
  }

  // Default behavior (no subcommand) - original `vc link` flow
  // Re-parse strictly now that we know there's no subcommand
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('link');
    output.print(help(linkCommand, { columns: client.stderr.columns }));
    return 2;
  }

  telemetry.trackCliFlagRepo(parsedArgs.flags['--repo']);
  telemetry.trackCliFlagYes(parsedArgs.flags['--yes']);
  telemetry.trackCliOptionProject(parsedArgs.flags['--project']);

  if ('--confirm' in parsedArgs.flags) {
    telemetry.trackCliFlagConfirm(parsedArgs.flags['--confirm']);
    output.warn('`--confirm` is deprecated, please use `--yes` instead');
    parsedArgs.flags['--yes'] = parsedArgs.flags['--confirm'];
  }

  const yes = !!parsedArgs.flags['--yes'];

  let cwd = parsedArgs.args[1];
  if (cwd) {
    telemetry.trackCliArgumentCwd();
    output.warn(
      `The ${cmd('vc link <directory>')} syntax is deprecated, please use ${cmd(
        `vc link --cwd ${cwd}`
      )} instead`
    );
  } else {
    cwd = client.cwd;
  }

  if (parsedArgs.flags['--repo']) {
    output.warn(`The ${cmd('--repo')} flag is in alpha, please report issues`);
    try {
      await ensureRepoLink(client, cwd, { yes, overwrite: true });
    } catch (err) {
      if (isPromptCanceledError(err)) {
        throw err;
      }
      output.prettyError(err);
      return 1;
    }
  } else {
    const explicitScopeProvided = detectExplicitScope(client);
    const projectNameOrId = parsedArgs.flags['--project'];

    if (isNonInteractiveLink(client)) {
      const linked = await linkNonInteractive(
        client,
        cwd,
        explicitScopeProvided,
        projectNameOrId
      );
      if (typeof linked === 'number') {
        return linked;
      }
      await refreshOidcTokenAfterLink(client, cwd);
      return 0;
    }

    let org: Org;
    let team: Team | null = null;
    if (explicitScopeProvided) {
      const explicit = await getExplicitOrg(client);
      org = explicit.org;
      team = explicit.team;
    } else {
      org = await selectOrg(client, 'Which team?', false, true);
      if (org.type === 'team') {
        team = await getTeamById(client, org.id);
      }
    }

    if (projectNameOrId) {
      const project = await getProjectByIdOrName(
        client,
        projectNameOrId,
        org.id
      );
      if (project instanceof ProjectNotFound) {
        return linkResolutionRequired(
          client,
          'project_not_found',
          org.slug,
          projectNameOrId
        );
      }
      await linkExistingProject(client, cwd, org, project);
      await refreshOidcTokenAfterLink(client, cwd);
      return 0;
    }

    const linked = await setupAndLink(client, cwd, {
      autoConfirm: yes,
      link: { status: 'not_linked', org: null, project: null },
      successEmoji: 'success',
      nonInteractive: false,
      searchAcrossTeams: Boolean(team),
      searchTeams: team ? [team] : undefined,
      org,
      allowCreateProject: !yes,
      pullEnv: false,
    });

    if (linked.status === 'not_linked') {
      return 0;
    }
    if (linked.status === 'error') {
      if (linked.reason === 'PROJECT_NOT_FOUND') {
        return linkResolutionRequired(client, 'missing_project', org.slug);
      }
      return linked.exitCode;
    }

    await refreshOidcTokenAfterLink(client, cwd);
    return 0;
  }

  return 0;
}
