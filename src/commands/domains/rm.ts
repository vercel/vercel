import ms from 'ms';
import chalk from 'chalk';
import plural from 'pluralize';
import table from 'text-table';

import { DomainNotFound, DomainPermissionDenied } from '../../util/errors-ts';
import { NowContext, Domain, DomainExtra } from '../../types';
import { Output } from '../../util/output';
import Client from '../../util/client';
import cmd from '../../util/output/cmd';
import deleteCertById from '../../util/certs/delete-cert-by-id';
import getDomainByName from '../../util/domains/get-domain-by-name';
import getScope from '../../util/get-scope';
import removeAliasById from '../../util/alias/remove-alias-by-id';
import removeDomainByName from '../../util/domains/remove-domain-by-name';
import stamp from '../../util/output/stamp';

type Options = {
  '--debug': boolean;
  '--yes': boolean;
};

export default async function rm(
  ctx: NowContext,
  opts: Options,
  args: string[],
  output: Output
) {
  const { authConfig: { token }, config } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = opts['--debug'];
  const client = new Client({ apiUrl, token, currentTeam, debug });
  const [domainName] = args;
  let contextName = null;

  try {
    ({ contextName } = await getScope(client));
  } catch (err) {
    if (err.code === 'not_authorized') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  if (!domainName) {
    output.error(`${cmd('now domains rm <domain>')} expects one argument`);
    return 1;
  }

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        '`now domains rm <domain>`'
      )}`
    );
    return 1;
  }

  const domain = await getDomainByName(client, contextName, domainName);
  if (domain instanceof DomainNotFound) {
    output.error(
      `Domain not found by "${domainName}" under ${chalk.bold(contextName)}`
    );
    output.log(`Run ${cmd('now domains ls')} to see your domains.`);
    return 1;
  }

  if (domain instanceof DomainPermissionDenied) {
    output.error(
      `You don't have access to the domain ${domainName} under ${chalk.bold(
        contextName
      )}`
    );
    output.log(`Run ${cmd('now domains ls')} to see your domains.`);
    return 1;
  }

  if (!opts['--yes'] && !await confirmDomainRemove(output, domain)) {
    output.log('Aborted');
    return 0;
  }

  const removeStamp = stamp();
  output.debug(`Removing aliases`);
  for (const alias of domain.aliases) {
    await removeAliasById(client, alias.id);
  }

  output.debug(`Removing certs`);
  for (const cert of domain.certs) {
    await deleteCertById(output, client, cert.id);
  }

  output.debug(`Removing domain`);
  await removeDomainByName(client, domain.name);
  console.log(
    `${chalk.cyan('> Success!')} Domain ${chalk.bold(
      domain.name
    )} removed ${removeStamp()}`
  );
  return 0;
}

async function confirmDomainRemove(
  output: Output,
  domain: Domain & DomainExtra
) {
  return new Promise(resolve => {
    const time = chalk.gray(`${ms(Date.now() - domain.createdAt)} ago`);
    const tbl = table([[chalk.bold(domain.name), time]], {
      align: ['r', 'l'],
      hsep: ' '.repeat(6)
    });

    output.log(`The following domain will be removed permanently`);
    output.print(`  ${tbl}\n`);

    if (domain.aliases.length > 0) {
      output.warn(
        `This domain's ${chalk.bold(
          plural('alias', domain.aliases.length, true)
        )} will be removed. Run ${chalk.dim('`now alias ls`')} to list them.`
      );
    }

    if (domain.certs.length > 0) {
      output.warn(
        `This domain's ${chalk.bold(
          plural('certificate', domain.certs.length, true)
        )} will be removed. Run ${chalk.dim('`now cert ls`')} to list them.`
      );
    }

    output.print(
      `${chalk.bold.red('> Are you sure?')} ${chalk.gray('[y/N] ')}`
    );
    process.stdin
      .on('data', d => {
        process.stdin.pause();
        resolve(
          d
            .toString()
            .trim()
            .toLowerCase() === 'y'
        );
      })
      .resume();
  });
}
