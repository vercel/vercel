import chalk from 'chalk';
import Client from '../../util/client';
import getScope from '../../util/get-scope';
import { DomainNotFound, InvalidDomain } from '../../util/errors-ts';
import stamp from '../../util/output/stamp';
import importZonefile from '../../util/dns/import-zonefile';
import { getCommandName } from '../../util/pkg-name';

type Options = {};

export default async function add(
  client: Client,
  opts: Options,
  args: string[]
) {
  const { output } = client;
  const { contextName } = await getScope(client);

  if (args.length !== 2) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('dns import <domain> <zonefile>')}`
      )}`
    );
    return 1;
  }

  const addStamp = stamp();
  const [domain, zonefilePath] = args;

  const recordIds = await importZonefile(
    client,
    contextName,
    domain,
    zonefilePath
  );
  if (recordIds instanceof DomainNotFound) {
    output.error(
      `The domain ${domain} can't be found under ${chalk.bold(
        contextName
      )} ${chalk.gray(addStamp())}`
    );
    return 1;
  }

  if (recordIds instanceof InvalidDomain) {
    output.error(
      `The domain ${domain} doesn't match with the one found in the Zone file ${chalk.gray(
        addStamp()
      )}`
    );
    return 1;
  }

  console.log(
    `${chalk.cyan('> Success!')} ${
      recordIds.length
    } DNS records for domain ${chalk.bold(domain)} created under ${chalk.bold(
      contextName
    )} ${chalk.gray(addStamp())}`
  );
  return 0;
}
