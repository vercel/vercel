import type Client from '../../util/client';
import type {
  Org,
  Project,
  ProjectLinked,
  Team,
  User,
} from '@vercel-internals/types';
import chalk from 'chalk';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import cmd from '../../util/output/cmd';
import { addRepoLink, ensureRepoLink } from '../../util/link/repo';
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
import getTeams from '../../util/teams/get-teams';
import getUser from '../../util/get-user';
import getProjectByIdOrName from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../util/errors-ts';
import {
  getLinkedProject,
  linkFolderToProject,
} from '../../util/projects/link';
import {
  argvHasNonInteractive,
  outputActionRequired,
} from '../../util/agent-output';
import { getCommandNamePlain } from '../../util/pkg-name';
import type { FetchOptions } from '../../util/client';
import { emoji } from '../../util/emoji';

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
    client.isAgent ||
    !client.stdin.isTTY
  );
}

type LinkOrgChoice = {
  org: Org;
  label: string;
  plainLabel: string;
};

async function getLinkOrgChoices(client: Client): Promise<LinkOrgChoice[]> {
  output.spinner('Loading teams…', 1000);
  let user: User;
  let teams: Team[];
  try {
    [user, teams] = await Promise.all([getUser(client), getTeams(client)]);
  } finally {
    output.stopSpinner();
  }

  const selectedTeamId =
    client.config.currentTeam ||
    (user.version === 'northstar' ? user.defaultTeamId : null);
  const choices: LinkOrgChoice[] = [];

  if (user.version !== 'northstar') {
    const plainLabel = `${user.name || user.email} (${user.username})`;
    choices.push({
      org: { type: 'user', id: user.id, slug: user.username },
      plainLabel,
      label: `${plainLabel}${
        !selectedTeamId ? ` ${chalk.bold('(current)')}` : ''
      }${user.limited ? ` ${emoji('locked')}` : ''}`,
    });
  }

  for (const team of teams.slice().sort((a, b) => {
    if (a.id === selectedTeamId) return -1;
    if (b.id === selectedTeamId) return 1;
    return a.name.localeCompare(b.name);
  })) {
    const plainLabel = team.name ? `${team.name} (${team.slug})` : team.slug;
    choices.push({
      org: { type: 'team', id: team.id, slug: team.slug },
      plainLabel,
      label: `${plainLabel}${
        team.id === selectedTeamId ? ` ${chalk.bold('(current)')}` : ''
      }${team.limited ? ` ${emoji('locked')}` : ''}`,
    });
  }

  return choices;
}

async function selectLinkOrg(client: Client): Promise<Org> {
  const choices = await getLinkOrgChoices(client);
  const selected = await client.input.search<LinkOrgChoice>({
    message: 'Which team?',
    source: term => {
      const searchTerm = term?.trim().toLowerCase();
      const filtered = searchTerm
        ? choices.filter(
            choice =>
              choice.plainLabel.toLowerCase().includes(searchTerm) ||
              choice.org.slug.toLowerCase().includes(searchTerm)
          )
        : choices;

      return filtered.map(choice => ({
        name: choice.label,
        value: choice,
      }));
    },
  });

  return selected.org;
}

type ProjectsPage = {
  projects: Project[];
  pagination: { count: number; next?: number | null };
};

async function fetchLinkProjects(
  client: Client,
  org: Org,
  limit: number
): Promise<ProjectsPage> {
  return await client.fetch<ProjectsPage>(`/v9/projects?limit=${limit}`, {
    accountId: org.id,
  });
}

async function selectExistingProject(
  client: Client,
  org: Org
): Promise<Project | null> {
  output.spinner('Loading projects…', 1000);
  let firstPage: ProjectsPage;
  try {
    firstPage = await fetchLinkProjects(client, org, 100);
  } finally {
    output.stopSpinner();
  }

  if (firstPage.projects.length === 0) {
    output.error(
      `No existing projects were found under ${org.slug}. Create one explicitly with ${getCommandNamePlain(
        `project add <project-name> --scope ${org.slug}`
      )}.`
    );
    return null;
  }

  const initialProjects = firstPage.projects
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const hasMoreProjects = firstPage.pagination.next != null;

  return await client.input.search<Project>({
    message: 'Which project?',
    source: async (term, { signal }) => {
      const searchTerm = term?.trim();
      if (!searchTerm) {
        return initialProjects.map(project => ({
          name: project.name,
          value: project,
        }));
      }

      const projects = hasMoreProjects
        ? (
            await client.fetch<{ projects: Project[] }>(
              `/v9/projects?search=${encodeURIComponent(searchTerm)}&limit=20`,
              {
                accountId: org.id,
                signal: signal as FetchOptions['signal'],
              }
            )
          ).projects
        : initialProjects.filter(
            project =>
              project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              project.id === searchTerm
          );

      return projects.map(project => ({
        name: project.name,
        value: project,
      }));
    },
  });
}

async function getExplicitOrg(client: Client): Promise<Org> {
  const scope = await getScope(client, { resolveLocalScope: true });
  return scope.org;
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
  | 'project_not_found';

function linkResolutionRequired(
  client: Client,
  reason: LinkResolutionReason,
  {
    org,
    projectNameOrId,
  }: {
    org?: Org;
    projectNameOrId?: string;
  } = {}
): number {
  const scope = org?.slug || '<team-slug>';
  const messages: Record<LinkResolutionReason, string> = {
    missing_scope:
      'A team must be selected by the user before linking. Do not choose the current, default, or first team.',
    missing_project: org
      ? `A project under ${scope} must be selected by the user before linking. Do not choose by list order, recency, folder name, or similarity.`
      : 'A project must be selected by the user before linking.',
    project_not_found: projectNameOrId
      ? `Project "${projectNameOrId}" was not found under ${scope}. Ask the user to select another existing project.`
      : `The requested project was not found under ${scope}.`,
  };
  const next =
    reason === 'missing_scope'
      ? [
          {
            command: getCommandNamePlain('teams list'),
            when: 'inspect available teams, then ask the user to choose',
          },
        ]
      : [
          {
            command: getCommandNamePlain(`project list --scope ${scope}`),
            when: 'inspect existing projects, then ask the user to choose',
          },
        ];

  outputActionRequired(
    client,
    {
      status: 'action_required',
      reason,
      message: messages[reason],
      userActionRequired: true,
      next,
      hint: 'Use next[] only to inspect available targets, then ask the user to choose. Do not infer a target.',
    },
    1
  );

  const humanNext = [...next];
  if (org) {
    humanNext.push({
      command: getCommandNamePlain(
        `project add <project-name> --scope ${scope}`
      ),
      when: 'create a project explicitly before linking',
    });
  }
  output.error(
    `${messages[reason]}\n\n${humanNext
      .map(item => `  ${item.command}`)
      .join('\n')}`
  );
  return 1;
}

async function linkExistingProject(
  client: Client,
  cwd: string,
  org: Org,
  project: Project
): Promise<ProjectLinked> {
  client.config.currentTeam = org.type === 'team' ? org.id : undefined;

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

async function linkNonInteractive(
  client: Client,
  cwd: string,
  explicitScopeProvided: boolean,
  projectNameOrId?: string
): Promise<ProjectLinked | number> {
  let selectedOrg: Org | null = null;

  if (explicitScopeProvided) {
    selectedOrg = await getExplicitOrg(client);
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
    return linkResolutionRequired(client, 'missing_scope');
  }

  if (projectNameOrId) {
    const project = await getProjectByIdOrName(
      client,
      projectNameOrId,
      selectedOrg.id
    );
    if (project instanceof ProjectNotFound) {
      return linkResolutionRequired(client, 'project_not_found', {
        org: selectedOrg,
        projectNameOrId,
      });
    }
    return await linkExistingProject(client, cwd, selectedOrg, project);
  }

  return linkResolutionRequired(client, 'missing_project', {
    org: selectedOrg,
  });
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
      const originalNonInteractive = client.nonInteractive;
      if (client.isAgent) {
        client.nonInteractive = true;
      }
      try {
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
      } finally {
        client.nonInteractive = originalNonInteractive;
      }
    }

    let org: Org;
    if (explicitScopeProvided) {
      org = await getExplicitOrg(client);
    } else {
      org = await selectLinkOrg(client);
    }

    if (projectNameOrId) {
      const project = await getProjectByIdOrName(
        client,
        projectNameOrId,
        org.id
      );
      if (project instanceof ProjectNotFound) {
        return linkResolutionRequired(client, 'project_not_found', {
          org,
          projectNameOrId,
        });
      }
      await linkExistingProject(client, cwd, org, project);
      await refreshOidcTokenAfterLink(client, cwd);
      return 0;
    }

    const project = await selectExistingProject(client, org);
    if (!project) {
      return 1;
    }

    await linkExistingProject(client, cwd, org, project);
    await refreshOidcTokenAfterLink(client, cwd);
    return 0;
  }

  return 0;
}
