import chalk from 'chalk';
import {
  DomainNotFound,
  DNSPermissionDenied,
  DNSInvalidPort,
  DNSInvalidType,
} from '../../util/errors-ts';
import addDNSRecord from '../../util/dns/add-dns-record';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import parseAddDNSRecordArgs from '../../util/dns/parse-add-dns-record-args';
import stamp from '../../util/output/stamp';
import getDNSData from '../../util/dns/get-dns-data';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { DnsAddTelemetryClient } from '../../util/telemetry/commands/dns/add';
import { addSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';

export default async function add(client: Client, argv: string[]) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(addSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification, { permissive: true });
  } catch (err) {
    printError(err);
    return 1;
  }
  const { args } = parsedArgs;

  const parsedParams = parseAddDNSRecordArgs(args);
  if (!parsedParams) {
    output.error(
      `Invalid number of arguments. See: ${chalk.cyan(
        `${getCommandName('dns --help')}`
      )} for usage.`
    );
    return 1;
  }

  const addStamp = stamp();
  const { domain, data: argData } = parsedParams;
  const valueArgs = args.slice(3); // domain, name, type, ...valueArgs

  const telemetryClient = new DnsAddTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  telemetryClient.trackCliArgumentDomain(domain);
  telemetryClient.trackCliArgumentName(parsedParams.data?.name);
  telemetryClient.trackCliArgumentType(parsedParams.data?.type);
  telemetryClient.trackCliArgumentValues(valueArgs);

  const data = await getDNSData(client, argData);
  if (!data) {
    output.log(`Canceled`);
    return 1;
  }

  const { contextName } = await getScope(client);

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

  output.success(
    `DNS record for domain ${chalk.bold(domain)} ${chalk.gray(
      `(${record.uid})`
    )} created under ${chalk.bold(contextName)} ${chalk.gray(addStamp())}`
  );

  return 0;
}
