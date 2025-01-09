import ms from 'ms';
import chalk from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import { targetCommand } from './command';
import { getCommandName } from '../../util/pkg-name';
import { ensureLink } from '../../util/link/ensure-link';
import { formatProject } from '../../util/projects/format-project';
import { formatEnvironment } from '../../util/target/format-environment';
import type { CustomEnvironment } from '@vercel-internals/types';
import output from '../../output-manager';

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
      ['Target Name', 'Target Slug', 'Target ID', 'Type', 'Updated'].map(
        header => chalk.bold(chalk.cyan(header))
      ),
      ...result.flatMap(target => {
        const type =
          target.type === 'production'
            ? 'Production'
            : target.type === 'development'
              ? 'Development'
              : 'Preview';
        return [
          [
            formatEnvironment(link.org.slug, link.project.name, target),
            target.slug,
            target.id,
            type,
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
    ...environments,
    {
      id: 'development',
      slug: 'development',
      createdAt: 0,
      updatedAt: 0,
      type: 'development',
      description: '',
      domains: [],
    },
  ];
}
