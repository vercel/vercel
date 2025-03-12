import ms from 'ms';
import chalk from 'chalk';
import table from '../../util/output/table';
import output from '../../output-manager';
import { targetCommand } from './command';
import { getCommandName } from '../../util/pkg-name';
import { ensureLink } from '../../util/link/ensure-link';
import { formatProject } from '../../util/projects/format-project';
import { formatEnvironment } from '../../util/target/format-environment';
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
  if (argv.length !== 0) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('target ls')}`
      )}`
    );
    return 2;
  }

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
