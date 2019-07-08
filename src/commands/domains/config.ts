import chalk from 'chalk';
import psl from 'psl';

import { NowContext } from '../../types';
import { Output } from '../../util/output';
import * as ERRORS from '../../util/errors-ts';
import addDomain from '../../util/domains/add-domain';
import Client from '../../util/client';
import cmd from '../../util/output/cmd';
import formatDnsTable from '../../util/format-dns-table';
import formatNSTable from '../../util/format-ns-table';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import param from '../../util/output/param';
import checkDomainConfig from '../../util/domains/check-domain-config';
import withSpinner from '../../util/with-spinner';

type Options = {
  '--debug': boolean;
};

export default async function config(
  ctx: NowContext,
  opts: Options,
  args: string[],
  output: Output
) {
  const {
    authConfig: { token },
    config
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

  if (args.length !== 1) {
    output.error(`${cmd('now domains config <domain>')} expects one argument`);
    return 1;
  }

  const argDomainName = String(args[0]);
  const parsedDomain = psl.parse(argDomainName);
  if (parsedDomain.error) {
    output.error(`The provided domain name ${param(argDomainName)} is invalid`);
    return 1;
  }

  if (!parsedDomain.domain) {
    output.error(`The provided domain '${param(argDomainName)}' is not valid.`);
    return 1;
  }

  const domainName = [parsedDomain.subdomain, parsedDomain.domain]
    .filter(x => x && x.length > 0)
    .join('.');

  const domainConfig = await withSpinner('Checking domain configuration', () =>
    checkDomainConfig(client, domainName)
  );
  if (domainConfig instanceof ERRORS.InvalidDomain) {
    output.error(
      `The provided domain name "${domainConfig.meta.domain}" is invalid`
    );
    return 1;
  }

  if (!domainConfig.misconfigured) {
    output.success(`${param(domainName)} is properly configured for now`);
    return 0;
  }

  output.error(`${param(domainName)} is not properly configured for now.`);
  domainConfig.misconfiguredReasons.forEach((reason, index) => {
    output.print(`> ${reason}\n`);
  });
  return 1;
}
