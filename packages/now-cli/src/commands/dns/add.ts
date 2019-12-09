import chalk from 'chalk';
import {
  DomainNotFound,
  DNSPermissionDenied,
  DNSInvalidPort,
  DNSInvalidType
} from '../../util/errors-ts';
import { NowContext } from '../../types';
import { Output } from '../../util/output';
import addDNSRecord from '../../util/dns/add-dns-record';
import Client from '../../util/client';
import getScope from '../../util/get-scope';
import parseAddDNSRecordArgs from '../../util/dns/parse-add-dns-record-args';
import stamp from '../../util/output/stamp';
import getDNSData from '../../util/dns/get-dns-data';
import promptBool from '../../util/input/prompt-bool';

type Options = {
  '--debug': boolean;
};

export default async function add(
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
    if (err.code === 'NOT_AUTHORIZED') {
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
 
  const { domain, data: argData } = parsedParams;
  if (argData && argData.name.endsWith(domain)) {
    output.log(`${chalk.yellow('Warning!')} Domain identified inside the subdomain argument. The following record will be created:`);
    switch (argData.type) {
      case 'MX':
        output.log(
          chalk.bold(`${argData.type} ${argData.value} ${argData.mxPriority}`)
        );
        break;
      case 'SRV':
        output.log(
          chalk.bold(`${argData.type} ${argData.srv.priority} ${argData.srv.port} ${argData.srv.weight} ${argData.srv.target}`)
        );
        break;
      default:
        output.log(
          chalk.bold(`${argData.type} ${argData.value}`)
        );
        break;
    }
    if (!await promptBool(`Do you want to create this record on ${chalk.bold(argData.name)}.${chalk.bold(domain)}?`)) {
      output.log(`Aborted`);
      return 1;
    }
  }

  const addStamp = stamp();
  const data = await getDNSData(output, argData);
  if (!data) {
    output.log(`Aborted`);
    return 1;
  }

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

  if (record instanceof DNSInvalidPort) {
    output.error(
      `Invalid <port> parameter. A number was expected ${chalk.gray(
        addStamp()
      )}`
    );
    return 1;
  }

  if (record instanceof DNSInvalidType) {
    output.error(
      `Invalid <type> parameter "${
        record.meta.type
      }". Expected one of A, AAAA, ALIAS, CAA, CNAME, MX, SRV, TXT ${chalk.gray(
        addStamp()
      )}`
    );
    return 1;
  }

  if (record instanceof Error) {
    output.error(record.message);
    return 1;
  }

  output.log(
    `${chalk.cyan('> Success!')} DNS record for domain ${chalk.bold(
      domain
    )} ${chalk.gray(`(${record.uid})`)} created under ${chalk.bold(
      contextName
    )} ${chalk.gray(addStamp())}`
  );

  return 0;
}
