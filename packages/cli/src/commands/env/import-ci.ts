import type { Project, ProjectEnvVariable } from '@vercel-internals/types';
import pluralize from 'pluralize';
import type Client from '../../util/client';
import { outputActionRequired } from '../../util/agent-output';
import { isAPIError } from '../../util/errors-ts';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { CHECKBOX_INSTRUCTIONS } from '../../util/input/checkbox-instructions';
import { getRepoLink } from '../../util/link/repo';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { resolveProjectContext } from '../../util/projects/resolve-project-context';
import output from '../../output-manager';
import { importCiSubcommand } from './command';

type Environment = 'production' | 'preview' | 'development';
type ConflictStrategy = 'skip' | 'overwrite';
type Visibility = 'config' | 'secret';

type RepositoryRef = {
  provider: 'bitbucket' | 'cursor-origin' | 'github' | 'gitlab' | 'vercel';
  organizationId: string;
  repository: string;
};

type ImportResult = {
  imported: Array<{ key: string; visibility: Visibility }>;
  overwritten: Array<{ key: string; visibility: Visibility }>;
  skipped: Array<{ key: string; reason: 'conflict' | 'not_found' }>;
};

type ExistingCiVariable = {
  key: string;
  visibility: Visibility;
};

const environments: Array<{ name: string; value: Environment }> = [
  { name: 'Production', value: 'production' },
  { name: 'Preview', value: 'preview' },
  { name: 'Development', value: 'development' },
];

function getRepositoryRef(project: Project): RepositoryRef | null {
  const link = project.link as
    | (Record<string, unknown> & { type?: string })
    | undefined;
  if (!link?.type) return null;

  if (link.type === 'github' || link.type === 'github-limited') {
    if (typeof link.org !== 'string' || typeof link.repo !== 'string') {
      return null;
    }
    return {
      provider: 'github',
      organizationId: link.org,
      repository: link.repo,
    };
  }

  if (link.type === 'gitlab') {
    const projectId = link.projectId ?? link.repoId;
    if (typeof projectId !== 'string' && typeof projectId !== 'number') {
      return null;
    }
    return {
      provider: 'gitlab',
      organizationId: '',
      repository: String(projectId),
    };
  }

  if (link.type === 'bitbucket') {
    const workspaceUuid = link.workspaceUuid;
    const repoUuid = link.uuid;
    if (
      (typeof workspaceUuid !== 'string' &&
        typeof workspaceUuid !== 'number') ||
      (typeof repoUuid !== 'string' && typeof repoUuid !== 'number')
    ) {
      return null;
    }
    return {
      provider: 'bitbucket',
      organizationId: String(workspaceUuid),
      repository: String(repoUuid),
    };
  }

  if (link.type === 'vercel' || link.type === 'v0') {
    if (typeof link.org !== 'string' || typeof link.repo !== 'string') {
      return null;
    }
    return {
      provider: 'vercel',
      organizationId: link.org,
      repository: link.repo,
    };
  }

  if (link.type === 'cursor-origin') {
    if (
      typeof link.ownerId !== 'string' ||
      (typeof link.repoId !== 'string' && typeof link.repoId !== 'number')
    ) {
      return null;
    }
    return {
      provider: 'cursor-origin',
      organizationId: link.ownerId,
      repository: String(link.repoId),
    };
  }

  return null;
}

function repositoryLabel(repo: RepositoryRef): string {
  const name = repo.organizationId
    ? `${repo.organizationId}/${repo.repository}`
    : repo.repository;
  return `${repo.provider}:${name}`;
}

function uniqueKeys(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function printResults(result: ImportResult): void {
  output.print('\n');
  printAlignedLabel(
    'Imported',
    pluralize('variable', result.imported.length, true),
    { gutter: '✓' }
  );
  printAlignedLabel(
    'Overwritten',
    pluralize('variable', result.overwritten.length, true)
  );
  printAlignedLabel(
    'Skipped',
    pluralize('variable', result.skipped.length, true)
  );

  const rows = [
    ...result.imported.map(variable => ({
      ...variable,
      outcome: 'Imported',
      detail: variable.visibility === 'secret' ? 'Secret' : 'Config',
    })),
    ...result.overwritten.map(variable => ({
      ...variable,
      outcome: 'Overwritten',
      detail: variable.visibility === 'secret' ? 'Secret' : 'Config',
    })),
    ...result.skipped.map(variable => ({
      ...variable,
      outcome: 'Skipped',
      detail:
        variable.reason === 'conflict'
          ? 'Already exists'
          : 'Not found in source',
    })),
  ];

  for (const row of rows) {
    printAlignedLabel(row.outcome, `${row.key} (${row.detail})`);
  }
}

export default async function importCi(client: Client, argv: string[]) {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(importCiSubcommand.options)
    );
  } catch (error) {
    output.fatal(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const { args, flags } = parsedArgs;
  if (flags['--force'] && flags['--yes']) {
    output.fatal(
      '`--force` and `--yes` choose different conflict strategies. Pick one.'
    );
    return 1;
  }
  if (args.length > 1) {
    output.fatal('Specify at most one environment.');
    return 1;
  }

  const requestedEnvironment = args[0];
  if (
    requestedEnvironment &&
    !environments.some(
      environment => environment.value === requestedEnvironment
    )
  ) {
    output.fatal(
      'Environment must be `production`, `preview`, or `development`.'
    );
    return 1;
  }

  const gitBranch =
    typeof flags['--git-branch'] === 'string'
      ? flags['--git-branch']
      : undefined;
  if (gitBranch && requestedEnvironment && requestedEnvironment !== 'preview') {
    output.fatal('`--git-branch` may only be used with Preview.');
    return 1;
  }

  const repoLink = await getRepoLink(client, client.cwd);
  if (!repoLink?.repoConfig) {
    output.fatal(
      'This Git repository is not linked. Run `vercel link --repo` first.'
    );
    return 1;
  }

  const link = await resolveProjectContext({
    client,
    projectNameOrId: flags['--project'],
    commandName: 'env import-ci',
  });
  if (link.status === 'error') return link.exitCode;
  if (link.status === 'not_linked') {
    output.fatal(
      'No linked source Project was found. Run `vercel link --repo` first or pass `--project <name>`.'
    );
    return 1;
  }

  const linkedProject = repoLink.repoConfig.projects.find(
    project => project.id === link.project.id
  );
  if (!linkedProject) {
    output.fatal(
      `Project ${link.project.name} is not linked to this Git repository. Run \`vercel link --repo-add\` to link it.`
    );
    return 1;
  }

  const repository = getRepositoryRef(link.project);
  if (!repository) {
    output.fatal(
      `Project ${link.project.name} does not have a supported Git repository connection.`
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  output.print('\n');
  printAlignedLabel('Project', `${link.org.slug}/${link.project.name}`);
  printAlignedLabel('Repository', repositoryLabel(repository));

  let environment = requestedEnvironment as Environment | undefined;
  if (!environment) {
    if (client.nonInteractive) {
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'missing_environment',
          message:
            'Specify an environment: `production`, `preview`, or `development`.',
          choices: environments.map(choice => ({
            id: choice.value,
            name: choice.name,
          })),
        },
        1
      );
    }
    environment = await client.input.select({
      message: 'Environment?',
      choices: environments,
    });
  }

  if (gitBranch && environment !== 'preview') {
    output.fatal('`--git-branch` may only be used with Preview.');
    return 1;
  }

  const sourceQuery = new URLSearchParams({
    target: environment,
    source: 'vercel-cli:env:import-ci',
  });
  if (gitBranch) sourceQuery.set('gitBranch', gitBranch);

  const destinationQuery = new URLSearchParams(repository);
  output.spinner('Fetching Environment Variable metadata…');
  let sourceVariables: ProjectEnvVariable[];
  let existingVariables: ExistingCiVariable[];
  try {
    const [source, existing] = await Promise.all([
      client.fetch<{ envs: ProjectEnvVariable[] }>(
        `/v9/projects/${link.project.id}/env?${sourceQuery}`,
        { accountId: link.org.id }
      ),
      client.fetch<ExistingCiVariable[]>(
        `/v1/env/ci/repository-variables?${destinationQuery}`,
        { accountId: link.org.id }
      ),
    ]);
    sourceVariables = source.envs;
    existingVariables = existing;
  } catch (error) {
    output.stopSpinner();
    output.fatal(
      isAPIError(error)
        ? error.serverMessage
        : 'Failed to fetch Environment Variable metadata.'
    );
    return 1;
  }
  output.stopSpinner();

  const availableKeys = uniqueKeys(
    sourceVariables.map(variable => variable.key)
  );
  if (availableKeys.length === 0) {
    output.fatal(
      `No Environment Variables found in ${environment === 'preview' ? 'Preview' : environment === 'production' ? 'Production' : 'Development'}.`
    );
    return 1;
  }

  let keys = uniqueKeys(
    (flags['--key'] ?? []).flatMap(value => value.split(','))
  );
  if (keys.length === 0) {
    if (client.nonInteractive) {
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'missing_keys',
          message:
            'Specify at least one Environment Variable with `--key <name>`.',
          choices: availableKeys.map(key => ({ id: key, name: key })),
        },
        1
      );
    }
    keys = await client.input.checkbox({
      message: 'Environment Variables?',
      instructions: CHECKBOX_INSTRUCTIONS,
      choices: availableKeys.map(key => ({ name: key, value: key })),
    });
    if (keys.length === 0) {
      output.fatal('Select at least one Environment Variable.');
      return 1;
    }
  }

  const existingKeys = new Set(existingVariables.map(variable => variable.key));
  const conflictingKeys = keys.filter(key => existingKeys.has(key));
  let conflictStrategy: ConflictStrategy = 'skip';
  if (conflictingKeys.length > 0 && flags['--force']) {
    conflictStrategy = 'overwrite';
  } else if (
    conflictingKeys.length > 0 &&
    !flags['--yes'] &&
    client.nonInteractive
  ) {
    outputActionRequired(
      client,
      {
        status: 'action_required',
        reason: 'conflict_strategy_required',
        message:
          'Choose how to handle existing repository CI variables: pass `--yes` to skip them or `--force` to overwrite them.',
        choices: [
          { id: 'skip', name: 'Skip existing variables' },
          { id: 'overwrite', name: 'Overwrite existing variables' },
        ],
      },
      1
    );
  } else if (
    conflictingKeys.length > 0 &&
    !flags['--yes'] &&
    !client.nonInteractive
  ) {
    printAlignedLabel('Conflicts', conflictingKeys.join(', '));
    conflictStrategy = await client.input.select({
      message: 'Existing variables?',
      choices: [
        { name: 'Skip existing variables', value: 'skip' },
        { name: 'Overwrite existing variables', value: 'overwrite' },
      ],
    });
  }

  const body = {
    ...repository,
    sourceProjectId: link.project.id,
    target: environment,
    ...(gitBranch ? { gitBranch } : {}),
    keys,
    conflictStrategy,
  };

  output.spinner('Importing Environment Variables…');
  let result: ImportResult;
  try {
    result = await client.fetch<ImportResult>(
      '/v1/env/ci/repository-variables/import',
      {
        method: 'POST',
        accountId: link.org.id,
        body,
      }
    );
  } catch (error) {
    output.stopSpinner();
    output.fatal(
      isAPIError(error)
        ? error.serverMessage
        : 'Failed to import Environment Variables into Vercel CI.'
    );
    return 1;
  }
  output.stopSpinner();
  printResults(result);
  return 0;
}
