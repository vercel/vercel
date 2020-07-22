import ms from 'ms';
import psl from 'psl';
import chalk from 'chalk';
import plural from 'pluralize';

import Client from '../../util/client';
import getDomains from '../../util/domains/get-domains';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import { Output } from '../../util/output';
import formatTable from '../../util/format-table';
import { formatDateWithoutTime } from '../../util/format-date';
import { Domain, Project, NowContext } from '../../types';
import { getProjectsWithDomains } from '../../util/projects/get-projects-with-domains';
import getCommandFlags from '../../util/get-command-flags';
import { getCommandName } from '../../util/pkg-name';
import isDomainExternal from '../../util/domains/is-domain-external';
import { isPublicSuffix } from '../../util/domains/is-public-suffix';

type Options = {
  '--debug': boolean;
  '--next': number;
};

interface DomainInfo {
  domain: string;
  apexDomain: string;
  projectName: string | null;
  dns: 'Vercel' | 'External';
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
  const { '--debug': debug, '--next': nextTimestamp } = opts;
  const client = new Client({ apiUrl, token, currentTeam, debug });
  let contextName = null;

  if (typeof nextTimestamp !== undefined && Number.isNaN(nextTimestamp)) {
    output.error('Please provide a number for flag --next');
    return 1;
  }

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
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('domains ls')}`
      )}`
    );
    return 1;
  }

  const [{ domains, pagination }, projects] = await Promise.all([
    getDomains(client, contextName),
    getProjectsWithDomains(client),
  ] as const);

  if (projects instanceof Error) {
    output.prettyError(projects);
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

  if (domainsInfo.length > 0) {
    output.print(
      formatDomainsTable(domainsInfo).replace(/^(.*)/gm, `${' '.repeat(3)}$1`)
    );
    output.print('\n\n');
  }

  if (pagination && pagination.count === 20) {
    const flags = getCommandFlags(opts, ['_', '--next']);
    output.log(
      `To display the next page run ${getCommandName(
        `domains ls${flags} --next ${pagination.next}`
      )}`
    );
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
      dns: isDomainExternal(domain) ? 'External' : 'Vercel',
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
          dns: isDomainExternal(domain) ? 'External' : 'Vercel',
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
        configured: isPublicSuffix(target.domain),
        dns: isPublicSuffix(target.domain) ? 'Vercel' : 'External',
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
