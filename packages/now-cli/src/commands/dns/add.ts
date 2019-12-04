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
import { DNSRecordData } from '../../types'
import table from 'text-table';

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
  if (argData && domain === argData.name.substr(argData.name.length - domain.length, argData.name.length)) {
    const yes = await readConfirmation(
      output,
      'Domain identified inside the subdomain argument. The following record will be created',
      domain,
      argData
    );
    if (!yes) {
      output.error(`User aborted.`);
      return 0;
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

  console.log(
    `${chalk.cyan('> Success!')} DNS record for domain ${chalk.bold(
      domain
    )} ${chalk.gray(`(${record.uid})`)} created under ${chalk.bold(
      contextName
    )} ${chalk.gray(addStamp())}`
  );

  return 0;
}

function readConfirmation(
  output: Output,
  msg: string,
  domain: string,
  argData: any
) {
  return new Promise(resolve => {
    output.log(msg);
    output.print(
      `${table([getAddebleTableRow(domain, argData)], {
        align: ['l', 'r', 'l'],
        hsep: ' '.repeat(6)
      }).replace(/^(.*)/gm, '  $1')}\n`
    );
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

function getAddebleTableRow(domain: string, argData: any) {
  switch (argData.type) {
    case 'MX':
      return [
        chalk.bold(`${argData.name}.${domain} 
          ${argData.type} 
          ${argData.mxPriority || ''}
        `)
      ];
    case 'SRV':
      return [
        chalk.bold(`${argData.name}.${domain} 
          ${argData.type} 
          ${argData.srv.port || ''} 
          ${argData.srv.priority || ''} 
          ${argData.srv.target || ''} 
          ${argData.srv.weight || ''} 
        `)
      ];
    default:
      return [
        chalk.bold(`${argData.name}.${domain} 
          ${argData.type} 
          ${argData.value || ''} 
        `)
      ];
  }
}
