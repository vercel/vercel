import chalk from 'chalk';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { emoji, prependEmoji } from '../../util/emoji';
import { canPrompt } from '../../util/can-prompt';
import { stripSensitiveAuthArgs } from '../../util/redact-args';
import updateDNSRecord, {
  type UpdateDNSRecordData,
} from '../../util/dns/update-dns-record';
import { isAPIError } from '../../util/errors-ts';
import { DnsUpdateTelemetryClient } from '../../util/telemetry/commands/dns/update';
import { updateSubcommand } from './command';
import {
  outputActionRequired,
  outputAgentError,
  withGlobalFlags,
} from '../../util/agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';

const SRV_FLAGS = [
  '--srv-priority',
  '--srv-weight',
  '--srv-port',
  '--srv-target',
] as const;

export default async function update(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new DnsUpdateTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(updateSubcommand.options);
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
  const { args, flags } = parsedArgs;

  if (args.length !== 1) {
    if (client.nonInteractive) {
      const cmd = withGlobalFlags(client, 'dns update <id> [options]');
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
              when: 'to update a DNS record by id (use dns ls to find ids)',
            },
          ],
        },
        1
      );
    }
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('dns update <id> [options]')}`
      )}`
    );
    return 1;
  }

  const [recordId] = args;

  telemetry.trackCliArgumentId(recordId);
  telemetry.trackCliOptionName(flags['--name']);
  telemetry.trackCliOptionType(flags['--type']);
  telemetry.trackCliOptionValue(flags['--value']);
  telemetry.trackCliOptionTtl(flags['--ttl']);
  telemetry.trackCliOptionMxPriority(flags['--mx-priority']);
  telemetry.trackCliOptionSrvPriority(flags['--srv-priority']);
  telemetry.trackCliOptionSrvWeight(flags['--srv-weight']);
  telemetry.trackCliOptionSrvPort(flags['--srv-port']);
  telemetry.trackCliOptionSrvTarget(flags['--srv-target']);
  telemetry.trackCliOptionComment(flags['--comment']);

  const numericFlags = [
    '--ttl',
    '--mx-priority',
    '--srv-priority',
    '--srv-weight',
    '--srv-port',
  ] as const;
  for (const flagName of numericFlags) {
    const value = flags[flagName];
    if (value !== undefined && Number.isNaN(value)) {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: AGENT_STATUS.ERROR,
            reason: AGENT_REASON.INVALID_ARGUMENTS,
            message: `The ${flagName} option must be a number.`,
          },
          1
        );
      }
      output.error(`The ${flagName} option must be a number.`);
      return 1;
    }
  }

  const data: UpdateDNSRecordData = {};

  const name = flags['--name'];
  if (name !== undefined) {
    data.name = name === '@' ? '' : name;
  }
  if (flags['--type'] !== undefined) {
    data.type = flags['--type'];
  }
  if (flags['--value'] !== undefined) {
    data.value = flags['--value'];
  }
  if (flags['--ttl'] !== undefined) {
    data.ttl = flags['--ttl'];
  }
  if (flags['--mx-priority'] !== undefined) {
    data.mxPriority = flags['--mx-priority'];
  }
  if (flags['--comment'] !== undefined) {
    data.comment = flags['--comment'];
  }

  const srvFlagsProvided = SRV_FLAGS.filter(
    flagName => flags[flagName] !== undefined
  );
  if (srvFlagsProvided.length > 0) {
    if (srvFlagsProvided.length !== SRV_FLAGS.length) {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: AGENT_STATUS.ERROR,
            reason: AGENT_REASON.INVALID_ARGUMENTS,
            message: `Updating an SRV record requires all of ${SRV_FLAGS.join(', ')}.`,
          },
          1
        );
      }
      output.error(
        `Updating an SRV record requires all of ${SRV_FLAGS.join(', ')}.`
      );
      return 1;
    }
    data.srv = {
      priority: flags['--srv-priority']!,
      weight: flags['--srv-weight']!,
      port: flags['--srv-port']!,
      target: flags['--srv-target']!,
    };
  }

  if (Object.keys(data).length === 0) {
    if (client.nonInteractive) {
      const cmd = withGlobalFlags(client, 'dns update <id> [options]');
      outputActionRequired(
        client,
        {
          status: AGENT_STATUS.ACTION_REQUIRED,
          reason: AGENT_REASON.NO_CHANGES_REQUESTED,
          action: AGENT_ACTION.MISSING_ARGUMENTS,
          message: `Provide at least one field to update. Run: ${cmd}`,
          next: [
            {
              command: cmd,
              when: 'to update a DNS record (e.g. --value, --ttl, --comment)',
            },
            {
              command: withGlobalFlags(client, 'dns update --help'),
              when: 'for available options',
            },
          ],
        },
        1
      );
    }
    output.error(
      `Provide at least one field to update. See ${chalk.cyan(
        `${getCommandName('dns update --help')}`
      )} for available options.`
    );
    return 1;
  }

  const changeSummary = Object.entries(data)
    .map(([field, value]) => `${field}=${value === '' ? '@' : value}`)
    .join(', ');

  if (!canPrompt(client)) {
    const rerun = getCommandNamePlain(
      stripSensitiveAuthArgs(client.argv.slice(2))
        .filter(
          arg =>
            arg !== '--non-interactive' && !arg.startsWith('--non-interactive=')
        )
        .join(' ')
    );
    outputActionRequired(
      client,
      {
        status: AGENT_STATUS.ACTION_REQUIRED,
        reason: AGENT_REASON.INTERACTIVE_CONFIRMATION_REQUIRED,
        action: AGENT_ACTION.CONFIRMATION_REQUIRED,
        message:
          `Updating DNS record ${recordId} (${changeSummary}) overwrites a live record. ` +
          'This cannot be confirmed non-interactively: the user must run this command in a terminal and confirm.',
        userActionRequired: true,
        hint: 'Surface this to the user; the confirmation cannot be automated.',
        next: [
          {
            command: rerun,
            when: 'user runs this command in an interactive terminal to confirm',
          },
        ],
      },
      1
    );
    output.error(
      'This command must be run interactively to confirm overwriting the DNS record.'
    );
    return 1;
  }

  output.print(
    prependEmoji(
      `Updating DNS record ${chalk.gray(recordId)} will overwrite: ${chalk.bold(
        changeSummary
      )}\n`,
      emoji('warning')
    )
  );
  const confirmed = await client.input.confirm(
    `Update DNS record ${recordId}?`,
    false
  );
  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const updateStamp = stamp();

  let record;
  try {
    record = await updateDNSRecord(client, recordId, data);
  } catch (err) {
    if (isAPIError(err)) {
      if (err.status === 404) {
        output.error('DNS record not found');
        return 1;
      }
      if (err.status === 403) {
        output.error("You don't have permission to access this DNS record.");
        return 1;
      }
      if (err.status === 400) {
        output.error(err.serverMessage || 'The request was invalid.');
        return 1;
      }
    }
    printError(err);
    return 1;
  }

  const { contextName } = await getScope(client);
  output.success(
    `DNS record ${chalk.gray(`${record.id}`)} of domain ${chalk.bold(
      record.domain
    )} updated under ${chalk.bold(contextName)} ${chalk.gray(updateStamp())}`
  );

  return 0;
}
