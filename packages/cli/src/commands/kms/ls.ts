import chalk from 'chalk';
import plural from 'pluralize';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import getCommandFlags from '../../util/get-command-flags';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import { validateLsArgs } from '../../util/validate-ls-args';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { AGENT_STATUS } from '../../util/agent-output-constants';
import output from '../../output-manager';
import { getIssuers } from '../../util/kms/issuers';
import { formatIssuersTable, indentTable } from '../../util/kms/format';
import { handleKmsApiError } from '../../util/kms/errors';
import { KmsLsTelemetryClient } from '../../util/telemetry/commands/kms/ls';
import { listSubcommand } from './command';
import type { IssuerListResponse } from '../../util/kms/types';

export default async function ls(client: Client, argv: string[]) {
  const telemetry = new KmsLsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;

  const validationResult = validateLsArgs({
    commandName: 'kms ls',
    args,
    maxArgs: 0,
    exitCode: 2,
  });
  if (validationResult !== 0) {
    return validationResult;
  }

  telemetry.trackCliOptionFormat(opts['--format']);
  telemetry.trackCliFlagJson(opts['--json']);
  telemetry.trackCliOptionLimit(opts['--limit']);
  telemetry.trackCliOptionNext(opts['--next']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput || client.nonInteractive;

  const { contextName } = await getScope(client);

  const lsStamp = stamp();
  if (!client.nonInteractive) {
    output.spinner(`Fetching KMS issuers under ${chalk.bold(contextName)}`);
  }

  let response: IssuerListResponse;
  try {
    response = await getIssuers(client, {
      limit: opts['--limit'],
      next: opts['--next'],
    });
  } catch (err: unknown) {
    output.stopSpinner();
    const handled = handleKmsApiError(client, err, {
      attempted: 'Listing KMS issuers',
      contextName,
    });
    if (handled !== undefined) {
      return handled;
    }
    throw err;
  }

  const { issuers, pagination } = response;
  output.stopSpinner();

  if (asJson) {
    const jsonOutput = client.nonInteractive
      ? {
          status: AGENT_STATUS.OK,
          issuers,
          pagination,
          message: `${plural('issuer', issuers.length, true)} found.`,
          next: [
            {
              command: getCommandNamePlain('kms inspect <issuerId>'),
              when: 'Show an issuer with its keys and grants',
            },
          ],
        }
      : { issuers, pagination };
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
    return 0;
  }

  if (issuers.length === 0) {
    output.log(
      `No issuers found under ${chalk.bold(contextName)}. Run ${getCommandName(
        'kms add <name>'
      )} to create one.`
    );
    return 0;
  }

  output.log(
    `${plural('issuer', issuers.length, true)} found under ${chalk.bold(
      contextName
    )} ${chalk.gray(lsStamp())}`
  );
  output.print(indentTable(formatIssuersTable(issuers)));
  output.print('\n\n');

  if (pagination.next) {
    const flags = getCommandFlags(opts, ['_', '--next']);
    output.log(
      `To display the next page, run ${getCommandName(
        `kms ls${flags} --next ${pagination.next}`
      )}`
    );
  }

  return 0;
}
