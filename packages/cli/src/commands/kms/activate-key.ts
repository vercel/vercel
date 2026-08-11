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
import { activateSigningKey } from '../../util/kms/signing-keys';
import { handleKmsApiError } from '../../util/kms/errors';
import {
  invalidArgumentCount,
  invalidInput,
  kmsSuggestion,
  missingArgument,
} from '../../util/kms/args';
import { printSigningKeyRows } from '../../util/kms/format';
import type { SigningKey } from '../../util/kms/types';
import { KmsActivateKeyTelemetryClient } from '../../util/telemetry/commands/kms/activate-key';
import { activateKeySubcommand } from './command';

const USAGE = 'kms activate-key <issuerId> <keyId>';

export default async function activateKey(client: Client, argv: string[]) {
  const telemetry = new KmsActivateKeyTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    activateKeySubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;
  const [issuerId, keyId] = args;

  telemetry.trackCliArgumentIssuerId(issuerId);
  telemetry.trackCliArgumentKeyId(keyId);
  telemetry.trackCliOptionRevokePreviousAfterHours(
    opts['--revoke-previous-after-hours']
  );
  telemetry.trackCliOptionFormat(opts['--format']);

  if (!issuerId) {
    return missingArgument(client, {
      reason: AGENT_REASON.MISSING_ISSUER_ID,
      message: 'An issuer ID is required.',
      usage: USAGE,
    });
  }
  if (!keyId) {
    return missingArgument(client, {
      reason: AGENT_REASON.MISSING_KEY_ID,
      message: `A key ID is required. Run ${getCommandNamePlain(
        `kms inspect ${issuerId}`
      )} to list the issuer's keys.`,
      usage: USAGE,
    });
  }
  if (args.length > 2) {
    return invalidArgumentCount(client, USAGE);
  }

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput || client.nonInteractive;

  const revokePreviousAfterHours = opts['--revoke-previous-after-hours'];
  if (revokePreviousAfterHours !== undefined && revokePreviousAfterHours < 0) {
    return invalidInput(
      client,
      '--revoke-previous-after-hours must be 0 or more.'
    );
  }

  const { contextName } = await getScope(client);
  if (!client.nonInteractive) {
    output.spinner(`Activating key ${keyId}`);
  }

  let key: SigningKey;
  try {
    key = await activateSigningKey(client, issuerId, keyId, {
      ...(revokePreviousAfterHours !== undefined && {
        revokePreviousAfterHours,
      }),
    });
  } catch (err: unknown) {
    output.stopSpinner();
    const handled = handleKmsApiError(client, err, {
      notFound: `Key not found: ${keyId} on issuer ${issuerId}.`,
      attempted: 'Activating a signing key',
      contextName,
      next: [
        {
          command: kmsSuggestion(`kms inspect ${issuerId}`, client.argv),
          when: "List the issuer's keys",
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
          signingKey: key,
          message: `Signing key ${key.keyId} activated.`,
          next: [
            {
              command: getCommandNamePlain(`kms inspect ${issuerId}`),
              when: 'Show the issuer and its keys',
            },
          ],
        }
      : key;
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
    return 0;
  }

  printSigningKeyRows(key, { label: 'Activated', gutter: '✓' });
  printAlignedLabel('Issuer', issuerId);

  output.print('\n');
  output.log(
    `The previous key keeps verifying until its grace period ends. Check status: ${getCommandName(
      `kms inspect ${issuerId}`
    )}`
  );

  return 0;
}
