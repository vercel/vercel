//
import chalk from 'chalk';
import ms from 'ms';
import plural from 'pluralize';
import table from 'text-table';


import cmd from '../../util/output/cmd';
import getScope from '../../util/get-scope';
import Now from '../../util';
import stamp from '../../util/output/stamp';


import deleteCertById from '../../util/certs/delete-cert-by-id';
import getDomainByName from '../../util/domains/get-domain-by-name';
import getDomainAliases from '../../util/alias/get-domain-aliases';
import getCertsForDomain from '../../util/certs/get-certs-for-domain';
import removeAliasById from '../../util/alias/remove-alias-by-id';
import removeDomainByName from '../../util/domains/remove-domain-by-name';

async function rm(
  ctx            ,
  opts           ,
  args           ,
  output
)                  {
  const { authConfig: { token }, config } = ctx;
  const { currentTeam } = config;
  const { apiUrl } = ctx;
  const debug = opts['--debug'];

  let contextName = null;

  try {
    ({ contextName } = await getScope({
      apiUrl,
      token,
      debug,
      currentTeam
    }));
  } catch (err) {
    if (err.code === 'not_authorized') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  // $FlowFixMe
  const now = new Now({ apiUrl, token, debug, currentTeam });
  const [domainName] = args;

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

  const domain = await getDomainByName(
    output,
    now,
    contextName,
    domainName
  );
  if (!domain) {
    output.error(
      `Domain not found by "${domainName}" under ${chalk.bold(contextName)}`
    );
    output.log(`Run ${cmd('now domains ls')} to see your domains.`);
    return 1;
  }

  const aliases = await getDomainAliases(output, now, domain.name);
  const certs = await getCertsForDomain(output, now, domain.name);
  if (!opts['--yes'] && !await confirmDomainRemove(output, domain, aliases, certs)) {
    output.log('Aborted');
    return 0;
  }

  const removeStamp = stamp();
  output.debug(`Removing aliases`);
  for (const alias of aliases) {
    await removeAliasById(now, alias.uid);
  }

  output.debug(`Removing certs`);
  for (const cert of certs) {
    await deleteCertById(output, now, cert.uid);
  }

  output.debug(`Removing domain`);
  await removeDomainByName(output, now, domain.name);
  console.log(
    `${chalk.cyan('> Success!')} Domain ${chalk.bold(
      domain.name
    )} removed ${removeStamp()}`
  );
  return 0;
}

async function confirmDomainRemove(
  output        ,
  domain        ,
  aliases       ,
  certs
) {
  return new Promise(resolve => {
    const time = chalk.gray(`${ms(new Date() - new Date(domain.created))  } ago`);
    const tbl = table([[chalk.bold(domain.name), time]], {
      align: ['r', 'l'],
      hsep: ' '.repeat(6)
    });

    output.log(`The following domain will be removed permanently`);
    output.print(`  ${tbl}\n`);

    if (aliases.length > 0) {
      output.warn(
        `This domain's ${chalk.bold(
          plural('alias', aliases.length, true)
        )} will be removed. Run ${chalk.dim('`now alias ls`')} to list them.`
      );
    }

    if (certs.length > 0) {
      output.warn(
        `This domain's ${chalk.bold(
          plural('certificate', certs.length, true)
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

export default rm;
