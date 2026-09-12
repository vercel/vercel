import chalk from 'chalk';
import type { JSONObject } from '@vercel-internals/types';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import output from '../../output-manager';
import { updateIssuer } from '../../util/kms/issuers';
import type { UpdateIssuerPayload } from '../../util/kms/issuers';
import { handleKmsApiError } from '../../util/kms/errors';
import {
  invalidArgumentCount,
  invalidInput,
  kmsSuggestion,
  missingArgument,
} from '../../util/kms/args';
import { parseJsonObjectFlag } from '../../util/kms/parse-json-input';
import { printIssuerRows } from '../../util/kms/format';
import type { Issuer } from '../../util/kms/types';
import { KmsUpdateTelemetryClient } from '../../util/telemetry/commands/kms/update';
import { updateSubcommand } from './command';

const USAGE = 'kms update <issuerId>';

export default async function update(client: Client, argv: string[]) {
  const telemetry = new KmsUpdateTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(updateSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;
  const [issuerId] = args;

  telemetry.trackCliArgumentIssuerId(issuerId);
  telemetry.trackCliOptionName(opts['--name']);
  telemetry.trackCliOptionClaimsSchema(opts['--claims-schema']);
  telemetry.trackCliFlagRemoveClaimsSchema(opts['--remove-claims-schema']);
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

  const name = opts['--name'];
  const claimsSchemaFlag = opts['--claims-schema'];
  const removeClaimsSchema = opts['--remove-claims-schema'];

  if (claimsSchemaFlag && removeClaimsSchema) {
    return invalidInput(
      client,
      '--claims-schema and --remove-claims-schema conflict. Pass one or the other.'
    );
  }
  if (!name && !claimsSchemaFlag && !removeClaimsSchema) {
    return invalidInput(
      client,
      'Nothing to update. Pass --name, --claims-schema, or --remove-claims-schema.'
    );
  }

  let claimsSchema: JSONObject | undefined;
  if (claimsSchemaFlag) {
    try {
      claimsSchema = await parseJsonObjectFlag(
        client,
        '--claims-schema',
        claimsSchemaFlag
      );
    } catch (err) {
      return invalidInput(client, (err as Error).message);
    }
  }

  const payload: UpdateIssuerPayload = {
    ...(name && { name }),
    ...(claimsSchema && { claimsSchema }),
    // `null` is the API's clear signal, so it has to be sent explicitly.
    ...(removeClaimsSchema && { claimsSchema: null }),
  };

  const { contextName } = await getScope(client);
  if (!client.nonInteractive) {
    output.spinner(`Updating issuer ${issuerId}`);
  }

  let issuer: Issuer;
  try {
    issuer = await updateIssuer(client, issuerId, payload);
  } catch (err: unknown) {
    output.stopSpinner();
    const handled = handleKmsApiError(client, err, {
      notFound: `Issuer not found: ${issuerId}.`,
      attempted: 'Updating an issuer',
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
          message: `Issuer ${issuer.id} updated.`,
          next: [
            {
              command: getCommandNamePlain(`kms inspect ${issuer.id}`),
              when: 'Show the updated issuer',
            },
          ],
        }
      : issuer;
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
    return 0;
  }

  printIssuerRows(issuer, { label: 'Updated', gutter: '✓' });
  printAlignedLabel(
    'Claims Schema',
    issuer.claimsSchema ? 'set' : chalk.gray('none')
  );
  output.print('\n');
  output.log(`Inspect it: ${getCommandName(`kms inspect ${issuer.id}`)}`);

  return 0;
}
