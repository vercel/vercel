import chalk from 'chalk';
import { DomainNotFound, DNSPermissionDenied } from '../../util/errors-ts';
import { NowContext } from '../../types';
import { Output } from '../../util/output';
import addDNSRecord from '../../util/dns/add-dns-record';
import Client from '../../util/client';
import getScope from '../../util/get-scope';
import parseAddDNSRecordArgs from '../../util/dns/parse-add-dns-record-args';
import stamp from '../../util/output/stamp';

type Options = {
  '--debug': boolean;
};

export default async function add(
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

  const parsedParams = parseAddDNSRecordArgs(args);
  if (!parsedParams) {
    output.error(
      `Invalid number of arguments. See: ${chalk.cyan(
        '`now dns --help`'
      )} for usage.`
    );
    return 1;
  }

  const addStamp = stamp();
  const { domain, data } = parsedParams;

  const record = await addDNSRecord(client, domain, data);
  if (record instanceof DomainNotFound) {
    output.error(
      `The domain ${domain} can't be found under ${chalk.bold(
        contextName
      )} ${chalk.gray(addStamp())}`
    );
    return 1;
  }

  if (record instanceof DNSPermissionDenied) {
    output.error(
      `You don't have permissions to add records to domain ${domain} under ${chalk.bold(
        contextName
      )} ${chalk.gray(addStamp())}`
    );
    return 1;
  }

  console.log(
    `${chalk.cyan('> Success!')} DNS record for domain ${chalk.bold(
      domain
    )} ${chalk.gray(`(${record.uid})`)} created under ${chalk.bold(
      contextName
    )} ${chalk.gray(addStamp())}`
  );

  return 0;
}
