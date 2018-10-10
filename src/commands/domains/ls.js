// @flow
import chalk from 'chalk';
import ms from 'ms';
import plural from 'pluralize';
import table from 'text-table';

import { CLIContext, Output } from '../../util/types';
import getScope from '../../util/get-scope';
import getDomains from '../../util/domains/get-domains';
import isDomainExternal from '../../util/domains/is-domain-external';
import Now from '../../util';
import stamp from '../../util/output/stamp';
import strlen from '../../util/strlen';
import type { CLIDomainsOptions, Domain } from '../../util/types';

async function ls(
  ctx: CLIContext,
  opts: CLIDomainsOptions,
  args: string[],
  output: Output
): Promise<number> {
  const { authConfig: { token }, config } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = opts['--debug'];

  const { contextName } = await getScope({
    apiUrl,
    token,
    debug,
    currentTeam
  });

  // $FlowFixMe
  const now = new Now({ apiUrl, token, debug: opts['--debug'], currentTeam });
  const lsStamp = stamp();

  if (args.length !== 0) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan('`now domains ls`')}`
    );
    return 1;
  }

  const domains = await getDomains(output, now, contextName);
  output.log(
    `${plural('domain', domains.length, true)} found under ${chalk.bold(
      contextName
    )} ${chalk.gray(lsStamp())}\n`
  );
  if (domains.length > 0) {
    console.log(formatDomainsTable(domains));
  }

  return 0;
}

function formatDomainsTable(domains: Domain[]) {
  const current = new Date();
  return table(
    [
      ['', 'domain', 'dns', 'verified', 'cdn', 'age'].map(s => chalk.dim(s)),
      ...domains.map(domain => {
        const cdnEnabled = domain.cdnEnabled || false;
        const ns = isDomainExternal(domain) ? 'external' : 'zeit.world';
        const url = chalk.bold(domain.name);
        const time = chalk.gray(ms(current - new Date(domain.created)));
        return ['', url, ns, domain.verified, cdnEnabled, time];
      })
    ],
    {
      align: ['l', 'l', 'l', 'l', 'l'],
      hsep: ' '.repeat(2),
      stringLength: strlen
    }
  );
}

export default ls;
