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
import getDNSData from '../../util/dns/get-dns-data';
import stamp from '../../util/output/stamp';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import output from '../../output-manager';
import { DnsAddTelemetryClient } from '../../util/telemetry/commands/dns/add';
import { addSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  outputActionRequired,
  outputAgentError,
} from '../../util/agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';
import { getGlobalFlagsOnlyFromArgs } from '../../util/arg-common';

function withGlobalFlags(client: Client, commandTemplate: string): string {
  const flags = getGlobalFlagsOnlyFromArgs(client.argv.slice(2));
  return getCommandNamePlain(`${commandTemplate} ${flags.join(' ')}`.trim());
}

export default async function add(client: Client, argv: string[]) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(addSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: err instanceof Error ? err.message : String(err),
        },
        1
      );
    }
    printError(err);
    return 1;
  }
  const { args } = parsedArgs;

  const parsedParams = parseAddDNSRecordArgs(args);
  if (!parsedParams) {
    if (client.nonInteractive) {
      const cmd = withGlobalFlags(
        client,
        'dns add <domain> <name> <type> <value>'
      );
      outputActionRequired(
        client,
        {
          status: AGENT_STATUS.ACTION_REQUIRED,
          reason: AGENT_REASON.MISSING_ARGUMENTS,
          action: AGENT_ACTION.MISSING_ARGUMENTS,
          message: `Invalid number of arguments. Run: ${cmd}`,
          next: [
            {
              command: cmd,
              when: 'to add a DNS record (see dns --help for MX/SRV forms)',
            },
          ],
        },
        1
      );
    }
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

  if (client.nonInteractive && !argData) {
    const cmd = withGlobalFlags(
      client,
      'dns add <domain> <name> <type> <value>'
    );
    outputActionRequired(
      client,
      {
        status: AGENT_STATUS.ACTION_REQUIRED,
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        action: AGENT_ACTION.MISSING_ARGUMENTS,
        message:
          'In non-interactive mode full record details are required. Run: ' +
          cmd,
        next: [
          {
            command: cmd,
            when: 'to add a DNS record (replace placeholders)',
          },
          {
            command: withGlobalFlags(client, 'dns --help'),
            when: 'for usage and examples',
          },
        ],
      },
      1
    );
    return 1;
  }

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
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INCOMPLETE_RECORD,
          message:
            'Record details could not be determined non-interactively. Provide full arguments for dns add.',
          next: [
            {
              command: withGlobalFlags(client, 'dns --help'),
            },
          ],
        },
        1
      );
    }
    output.log(`Canceled`);
    return 1;
  }

  const { contextName } = await getScope(client, {
    resolveLocalScope: true,
  });

  const record = await addDNSRecord(client, domain, data);
  if (record instanceof DomainNotFound) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.DOMAIN_NOT_FOUND,
          message: `The domain ${domain} can't be found under ${contextName}.`,
          next: [
            {
              command: withGlobalFlags(client, 'dns ls'),
              when: 'to list DNS records for your scope',
            },
          ],
        },
        1
      );
    }
    output.error(
      `The domain ${domain} can't be found under ${chalk.bold(
        contextName
      )} ${chalk.gray(addStamp())}`
    );
    return 1;
  }

  if (record instanceof DNSPermissionDenied) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.PERMISSION_DENIED,
          message: `You don't have permissions to add records to domain ${domain} under ${contextName}.`,
        },
        1
      );
    }
    output.error(
      `You don't have permissions to add records to domain ${domain} under ${chalk.bold(
        contextName
      )} ${chalk.gray(addStamp())}`
    );
    return 1;
  }

  if (record instanceof DNSInvalidPort) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_PORT,
          message: 'Invalid <port> parameter. A number was expected.',
        },
        1
      );
    }
    output.error(
      `Invalid <port> parameter. A number was expected ${chalk.gray(
        addStamp()
      )}`
    );
    return 1;
  }

  if (record instanceof DNSInvalidType) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_DNS_TYPE,
          message: `Invalid <type> parameter "${record.meta.type}". Expected one of A, AAAA, ALIAS, CAA, CNAME, MX, SRV, TXT.`,
        },
        1
      );
    }
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
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.DNS_ADD_FAILED,
          message: record.message,
        },
        1
      );
    }
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
