import chalk from 'chalk';
import ms from 'ms';
import table from '../../util/output/table';
import Client from '../../util/client';
import { getCommandName } from '../../util/pkg-name';
import type { ProjectLinked } from '@vercel-internals/types';
import type { CustomEnvironment } from '../../util/target/types';

export default async function list(
  client: Client,
  argv: any,
  args: string[],
  link: ProjectLinked
) {
  const { output } = client;
  if (args.length !== 0) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('target ls')}`
      )}`
    );
    return 2;
  }

  const start = Date.now();
  const projectUrl = `https://vercel.com/${link.org.slug}/${link.project.name}`;
  const projectSlugLink = output.link(
    chalk.bold(`${link.org.slug}/${link.project.name}`),
    projectUrl,
    {
      fallback: () => chalk.bold(`${link.org.slug}/${link.project.name}`),
      color: false,
    }
  );

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
      ...result
        .map(target => {
          const boldName = chalk.bold(target.name);
          const type =
            target.type === 'production'
              ? 'Production'
              : target.type === 'development'
                ? 'Development'
                : 'Preview';
          return [
            [
              output.link(
                boldName,
                `${projectUrl}/settings/environments/${target.id}`,
                { fallback: () => boldName, color: false }
              ),
              target.slug,
              target.id,
              type,
              chalk.gray(
                target.updatedAt > 0 ? ms(Date.now() - target.updatedAt) : '-'
              ),
            ],
          ];
        })
        .flat(),
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
      name: 'Production',
      domains: [],
    },
    {
      id: 'preview',
      slug: 'preview',
      createdAt: 0,
      updatedAt: 0,
      type: 'preview',
      description: '',
      name: 'Preview',
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
      name: 'Development',
      domains: [],
    },
  ];
}
