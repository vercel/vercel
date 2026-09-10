import chalk from 'chalk';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import formatDate from '../../util/format-date';
import { getCommandNamePlain } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import output from '../../output-manager';
import { getIssuer } from '../../util/kms/issuers';
import { handleKmsApiError } from '../../util/kms/errors';
import {
  invalidArgumentCount,
  kmsSuggestion,
  missingArgument,
} from '../../util/kms/args';
import {
  formatGrantsTable,
  formatSigningKeysTable,
  indentTable,
  printIssuerRows,
} from '../../util/kms/format';
import { issuerJwksUrl, issuerUrl } from '../../util/kms/types';
import type { Issuer } from '../../util/kms/types';
import { KmsInspectTelemetryClient } from '../../util/telemetry/commands/kms/inspect';
import { inspectSubcommand } from './command';

const USAGE = 'kms inspect <issuerId>';

export default async function inspect(client: Client, argv: string[]) {
  const telemetry = new KmsInspectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(inspectSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;
  const [issuerId] = args;

  telemetry.trackCliArgumentIssuerId(issuerId);
  telemetry.trackCliOptionFormat(opts['--format']);
  telemetry.trackCliFlagJson(opts['--json']);

  if (!issuerId) {
    return missingArgument(client, {
      reason: AGENT_REASON.MISSING_ISSUER_ID,
      message: 'An issuer ID is required.',
      usage: USAGE,
    });
  }
  if (args.length > 1) {
    return invalidArgumentCount(client, USAGE);
  }

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput || client.nonInteractive;

  const { contextName } = await getScope(client);
  if (!client.nonInteractive) {
    output.spinner(`Fetching issuer ${issuerId}`);
  }

  let issuer: Issuer;
  try {
    issuer = await getIssuer(client, issuerId);
  } catch (err: unknown) {
    output.stopSpinner();
    const handled = handleKmsApiError(client, err, {
      notFound: `Issuer not found: ${issuerId}.`,
      attempted: 'Reading this issuer',
      contextName,
      next: [
        {
          command: kmsSuggestion('kms ls', client.argv),
          when: 'List issuers in this team',
        },
      ],
    });
    if (handled !== undefined) {
      return handled;
    }
    throw err;
  }

  output.stopSpinner();

  if (asJson) {
    const jsonOutput = client.nonInteractive
      ? {
          status: AGENT_STATUS.OK,
          issuer,
          message: `Issuer ${issuer.id} found.`,
          next: [
            {
              command: getCommandNamePlain(`kms add-key ${issuer.id}`),
              when: 'Rotate to a new signing key',
            },
          ],
        }
      : issuer;
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
    return 0;
  }

  printIssuerRows(issuer);
  printAlignedLabel('Issuer URL', chalk.cyan(issuerUrl(issuer.id)));
  printAlignedLabel('JWKS', chalk.cyan(issuerJwksUrl(issuer.id)));
  printAlignedLabel('Created', formatDate(issuer.createdAt));
  printAlignedLabel(
    'Claims Schema',
    issuer.claimsSchema ? 'set' : chalk.gray('none')
  );

  output.print('\n');
  output.print(`  ${chalk.bold('Signing keys')}\n`);
  if (issuer.signingKeys.length === 0) {
    output.print(`  ${chalk.gray('No signing keys.')}\n`);
  } else {
    output.print(indentTable(formatSigningKeysTable(issuer.signingKeys)));
    output.print('\n');
  }

  output.print('\n');
  output.print(`  ${chalk.bold('Grants')}\n`);
  if (issuer.policies.length === 0) {
    // The API returns an empty list both for an issuer with no grants and for
    // a caller who can't read them, so don't claim there are none.
    output.print(
      `  ${chalk.gray('No grants visible. Only team owners can see grants.')}\n`
    );
  } else {
    output.print(indentTable(formatGrantsTable(issuer.policies)));
    output.print('\n');
  }

  output.print('\n');
  return 0;
}
