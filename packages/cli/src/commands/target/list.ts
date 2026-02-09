import ms from 'ms';
import chalk from 'chalk';
import table from '../../util/output/table';
import output from '../../output-manager';
import { listSubcommand, targetCommand } from './command';
import { validateLsArgs } from '../../util/validate-ls-args';
import { ensureLink } from '../../util/link/ensure-link';
import { formatProject } from '../../util/projects/format-project';
import { formatEnvironment } from '../../util/target/format-environment';
import { validateJsonOutput } from '../../util/output-format';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { TelemetryClient } from '../../util/telemetry';
import type Client from '../../util/client';
import type {
  CustomEnvironment,
  CustomEnvironmentBranchMatcher,
  CustomEnvironmentType,
  Project,
} from '@vercel-internals/types';

function formatBranchMatcher(
  branchMatcher?: CustomEnvironmentBranchMatcher
): string {
  if (branchMatcher?.type === 'equals') {
    return branchMatcher.pattern;
  } else if (branchMatcher?.type === 'startsWith') {
    return `${branchMatcher.pattern}${chalk.dim('*')}`;
  } else if (branchMatcher?.type === 'endsWith') {
    return `${chalk.dim('*')}${branchMatcher.pattern}`;
  }
  return chalk.dim('No branch configuration');
}

const TYPE_MAP: Record<CustomEnvironmentType, string> = {
  production: 'Production',
  preview: 'Preview',
  development: 'Development',
};

const BRANCH_TRACKING_MAP: Record<
  CustomEnvironmentType,
  (project: Project, target: CustomEnvironment) => string
> = {
  production: project => project.link?.productionBranch ?? 'main',
  preview: (_, env) =>
    env.slug === 'preview'
      ? chalk.dim('All unassigned git branches')
      : formatBranchMatcher(env.branchMatcher),
  development: () => chalk.dim('Accessible via CLI'),
};

export default async function list(client: Client, argv: string[]) {
  const { cwd } = client;

  const telemetry = new TelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const validationResult = validateLsArgs({
    commandName: 'target ls',
    args: parsedArgs.args,
    maxArgs: 0,
    exitCode: 2,
  });
  if (validationResult !== 0) {
    return validationResult;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);

  const link = await ensureLink(targetCommand.name, client, cwd);
  if (typeof link === 'number') {
    return link;
  }
  const start = Date.now();
  const projectSlugLink = formatProject(link.org.slug, link.project.name);

  output.spinner(`Fetching custom environments for ${projectSlugLink}`);

  const url = `/projects/${encodeURIComponent(
    link.project.id
  )}/custom-environments`;

  let { environments: result } = (await client.fetch(url, {
    method: 'GET',
    accountId: link.org.id,
  })) as {
    environments: CustomEnvironment[];
  };

  output.stopSpinner();

  const elapsed = ms(Date.now() - start);

  result = withDefaultEnvironmentsIncluded(result);

  if (asJson) {
    const jsonOutput = {
      targets: result.map(target => ({
        id: target.id,
        slug: target.slug,
        type: target.type,
        description: target.description,
        branchMatcher: target.branchMatcher,
        createdAt: target.createdAt,
        updatedAt: target.updatedAt,
      })),
    };
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
  } else {
    output.log(
      `${result.length} Environment${
        result.length === 1 ? '' : 's'
      } found under ${projectSlugLink} ${chalk.gray(`[${elapsed}]`)}`
    );

    const tablePrint = table(
      [
        ['Target Name', 'Branch Tracking', 'Type', 'Updated'].map(header =>
          chalk.bold(chalk.cyan(header))
        ),
        ...result.flatMap(target => {
          return [
            [
              formatEnvironment(link.org.slug, link.project.name, target),
              BRANCH_TRACKING_MAP[target.type](link.project, target),
              TYPE_MAP[target.type],
              chalk.gray(
                target.updatedAt > 0 ? ms(Date.now() - target.updatedAt) : '-'
              ),
            ],
          ];
        }),
      ],
      { hsep: 3 }
    ).replace(/^/gm, '  ');
    output.print(`\n${tablePrint}\n\n`);
  }
  return 0;
}

function withDefaultEnvironmentsIncluded(
  environments: CustomEnvironment[]
): CustomEnvironment[] {
  return [
    {
      id: 'production',
      slug: 'production',
      createdAt: 0,
      updatedAt: 0,
      type: 'production',
      description: '',
      domains: [],
    },
    {
      id: 'preview',
      slug: 'preview',
      createdAt: 0,
      updatedAt: 0,
      type: 'preview',
      description: '',
      domains: [],
    },
    {
      id: 'development',
      slug: 'development',
      createdAt: 0,
      updatedAt: 0,
      type: 'development',
      description: '',
      domains: [],
    },
    ...environments.slice().sort((a, b) => a.slug.localeCompare(b.slug)),
  ];
}
