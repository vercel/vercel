import ms from 'ms';
import psl from 'psl';
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

interface DomainInfo {
  domain: string;
  apexDomain: string;
  projectName: string | null;
  dns: 'ZEIT' | 'External';
  configured: boolean;
  expiresAt: number | null;
  createdAt: number | null;
}

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

  const domainsInfo = createDomainsInfo(domains, projects);

  output.log(
    `${plural(
      'project domain',
      domainsInfo.length,
      true
    )} found under ${chalk.bold(contextName)} ${chalk.gray(lsStamp())}`
  );

  if (domains.length > 0) {
    output.print(
      formatDomainsTable(domainsInfo).replace(/^(.*)/gm, `${' '.repeat(3)}$1`)
    );
    output.print('\n\n');
  }

  return 0;
}

function createDomainsInfo(domains: Domain[], projects: Project[]) {
  const info = new Map<string, DomainInfo>();

  domains.forEach(domain => {
    info.set(domain.name, {
      domain: domain.name,
      apexDomain: domain.name,
      projectName: null,
      expiresAt: domain.expiresAt || null,
      createdAt: domain.createdAt,
      configured: Boolean(domain.verified),
      dns: domain.serviceType === 'zeit.world' ? 'ZEIT' : 'External',
    });

    projects.forEach(project => {
      (project.alias || []).forEach(target => {
        if (!target.domain.endsWith(domain.name)) return;

        info.set(target.domain, {
          domain: target.domain,
          apexDomain: domain.name,
          projectName: project.name,
          expiresAt: domain.expiresAt || null,
          createdAt: domain.createdAt || target.createdAt || null,
          configured: Boolean(domain.verified),
          dns: domain.serviceType === 'zeit.world' ? 'ZEIT' : 'External',
        });
      });
    });
  });

  projects.forEach(project => {
    (project.alias || []).forEach(target => {
      if (info.has(target.domain)) return;

      const { domain: apexDomain } = psl.parse(
        target.domain
      ) as psl.ParsedDomain;

      info.set(target.domain, {
        domain: target.domain,
        apexDomain: apexDomain || target.domain,
        projectName: project.name,
        expiresAt: null,
        createdAt: target.createdAt || null,
        configured: target.domain.endsWith('.now.sh') ? true : false,
        dns: target.domain.endsWith('.now.sh') ? 'ZEIT' : 'External',
      });
    });
  });

  const list = Array.from(info.values());

  return list.sort((a, b) => {
    if (a.apexDomain === b.apexDomain) {
      if (a.apexDomain === a.domain) return -1;
      if (b.apexDomain === b.domain) return 1;
      return a.domain.localeCompare(b.domain);
    }

    return a.apexDomain.localeCompare(b.apexDomain);
  });
}

function formatDomainsTable(domainsInfo: DomainInfo[]) {
  const current = Date.now();

  const rows: string[][] = domainsInfo.map(info => {
    const expiration = formatDateWithoutTime(info.expiresAt);
    const age = info.createdAt ? ms(current - info.createdAt) : '-';

    return [
      info.domain,
      info.projectName || '-',
      info.dns,
      expiration,
      info.configured.toString(),
      chalk.gray(age),
    ];
  });

  const table = formatTable(
    ['domain', 'project', 'dns', 'expiration', 'configured', 'age'],
    ['l', 'l', 'l', 'l', 'l', 'l'],
    [{ rows }]
  );

  return table;
}
