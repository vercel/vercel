import ms from 'ms';
import chalk from 'chalk';
import plural from 'pluralize';

import Client from '../../util/client';
import getDomains from '../../util/domains/get-domains';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import strlen from '../../util/strlen';
import { Output } from '../../util/output';
import formatTable from '../../util/format-table';
import { formatDateWithoutTime } from '../../util/format-date';
import { Domain, Project, NowContext } from '../../types';
import { getProjectsWithDomains } from '../../util/projects/get-projects-with-domains';

type Options = {
  '--debug': boolean;
};

export default async function ls(
  ctx: NowContext,
  opts: Options,
  args: string[],
  output: Output
) {
  const {
    authConfig: { token },
    config,
  } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = opts['--debug'];
  const client = new Client({ apiUrl, token, currentTeam, debug });
  let contextName = null;

  try {
    ({ contextName } = await getScope(client));
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  const lsStamp = stamp();

  if (args.length !== 0) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan('`now domains ls`')}`
    );
    return 1;
  }

  const [domains, projects] = await Promise.all([
    getDomains(client, contextName),
    getProjectsWithDomains(client),
  ]);

  if (projects instanceof Error) {
    output.error(projects.message);
    return 1;
  }

  output.log(
    `${plural('domain', domains.length, true)} found under ${chalk.bold(
      contextName
    )} ${chalk.gray(lsStamp())}`
  );

  if (domains.length > 0) {
    output.print(
      formatDomainsTable(domains, projects).replace(
        /^(.*)/gm,
        `${' '.repeat(3)}$1`
      )
    );
    output.print('\n\n');
  }

  return 0;
}

function getProjectForDomain(domain: Domain, projects: Project[]) {
  return projects.find(
    ({ alias }) => alias && alias.find(({ domain: d }) => d === domain.name)
  );
}

function formatDomainsTable(domains: Domain[], projects: Project[]) {
  const current = new Date();
  const rows: string[][] = [];

  domains.forEach(domain => {
    const projectForDomain = getProjectForDomain(domain, projects);

    const dns = domain.serviceType;
    const exp = formatDateWithoutTime(domain.expiresAt);
    const conf = Boolean(domain.verified).toString();

    if (projectForDomain) {
      const age = chalk.gray(ms(current.getTime() - domain.createdAt));
      rows.push([domain.name, projectForDomain.name, dns, exp, conf, age]);
    } else {
      const age = chalk.gray(ms(current.getTime() - domain.createdAt));
      rows.push([domain.name, '-', dns, exp, conf, age]);
    }

    projects.forEach(project => {
      if (project.id === (projectForDomain && projectForDomain.id)) return;

      (project.alias || []).forEach(target => {
        if (target.domain.endsWith(domain.name)) {
          const age = chalk.gray(
            target.createdAt ? ms(current.getTime() - target.createdAt) : '-'
          );
          rows.push([target.domain, project.name, dns, exp, conf, age]);
        }
      });
    });
  });

  const table = formatTable(
    ['domain', 'project', 'dns', 'expiration', 'configured', 'age'],
    ['l', 'l', 'l', 'l', 'l', 'l'],
    [{ rows }]
  );

  return table;
}
