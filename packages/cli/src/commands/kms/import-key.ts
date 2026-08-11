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
import { createSigningKey } from '../../util/kms/signing-keys';
import type { CreateSigningKeyPayload } from '../../util/kms/signing-keys';
import { handleKmsApiError } from '../../util/kms/errors';
import {
  invalidArgumentCount,
  invalidInput,
  missingArgument,
} from '../../util/kms/args';
import { resolveIssuerForKeySource } from '../../util/kms/key-origin';
import { readPrivateKey } from '../../util/kms/parse-json-input';
import { printSigningKeyRows } from '../../util/kms/format';
import type { SigningKey } from '../../util/kms/types';
import { KmsImportKeyTelemetryClient } from '../../util/telemetry/commands/kms/import-key';
import { importKeySubcommand } from './command';

const USAGE = 'kms import-key <issuerId> --key <file>';
const ACTIVATION_MODES = ['automatic', 'manual'] as const;

export default async function importKey(client: Client, argv: string[]) {
  const telemetry = new KmsImportKeyTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(importKeySubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;
  const [issuerId] = args;

  telemetry.trackCliArgumentIssuerId(issuerId);
  telemetry.trackCliOptionKey(opts['--key']);
  telemetry.trackCliOptionKeyId(opts['--key-id']);
  telemetry.trackCliOptionActivation(opts['--activation']);
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
  if (args.length > 1) {
    return invalidArgumentCount(client, USAGE);
  }

  const keyFlag = opts['--key'];
  if (!keyFlag) {
    return missingArgument(client, {
      reason: AGENT_REASON.MISSING_KEY,
      message:
        'A private key is required. Pass --key with a path to a PEM file, or `-` to read it from stdin.',
      usage: USAGE,
    });
  }

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput || client.nonInteractive;

  const activation = opts['--activation'];
  if (
    activation &&
    !ACTIVATION_MODES.includes(activation as (typeof ACTIVATION_MODES)[number])
  ) {
    return invalidInput(
      client,
      `Invalid activation mode "${activation}". Use ${ACTIVATION_MODES.join(' or ')}.`
    );
  }

  const revokePreviousAfterHours = opts['--revoke-previous-after-hours'];
  if (revokePreviousAfterHours !== undefined && revokePreviousAfterHours < 0) {
    return invalidInput(
      client,
      '--revoke-previous-after-hours must be 0 or more.'
    );
  }

  let importKeyPem: string;
  try {
    importKeyPem = await readPrivateKey(client, keyFlag);
  } catch (err) {
    return invalidInput(client, (err as Error).message);
  }

  const keyId = opts['--key-id'];
  const payload: CreateSigningKeyPayload = {
    importKey: importKeyPem,
    ...(keyId && { importKeyId: keyId }),
    ...(activation && {
      activation: activation as (typeof ACTIVATION_MODES)[number],
    }),
    ...(revokePreviousAfterHours !== undefined && { revokePreviousAfterHours }),
  };

  const { contextName } = await getScope(client);
  const attempted = 'Importing a signing key';
  const issuer = await resolveIssuerForKeySource(client, issuerId, {
    source: 'imported',
    attempted,
    contextName,
  });
  if (typeof issuer === 'number') {
    return issuer;
  }

  if (!client.nonInteractive) {
    output.spinner(`Importing a signing key into ${issuerId}`);
  }

  let key: SigningKey;
  try {
    key = await createSigningKey(client, issuerId, payload);
  } catch (err: unknown) {
    output.stopSpinner();
    const handled = handleKmsApiError(client, err, {
      notFound: `Issuer not found: ${issuerId}.`,
      attempted,
      contextName,
    });
    if (handled !== undefined) {
      return handled;
    }
    throw err;
  }

  output.stopSpinner();

  const activateCommand = `kms activate-key ${issuerId} ${key.keyId}`;
  const isManual = key.status === 'pending' && !key.activateAt;

  if (asJson) {
    const jsonOutput = client.nonInteractive
      ? {
          status: AGENT_STATUS.OK,
          signingKey: key,
          message: `Signing key ${key.keyId} imported into issuer ${issuerId}.`,
          next: isManual
            ? [
                {
                  command: getCommandNamePlain(activateCommand),
                  when: 'Start signing with this key',
                },
              ]
            : [
                {
                  command: getCommandNamePlain(`kms inspect ${issuerId}`),
                  when: 'Check when the key becomes active',
                },
              ],
        }
      : key;
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
    return 0;
  }

  printSigningKeyRows(key, { label: 'Imported', gutter: '✓' });
  printAlignedLabel('Issuer', issuerId);

  output.print('\n');
  if (isManual) {
    output.log(
      `The key is staged and not signing yet. Activate it: ${getCommandName(activateCommand)}`
    );
  } else {
    output.log(
      `The key starts signing once its public key propagates. Check status: ${getCommandName(
        `kms inspect ${issuerId}`
      )}`
    );
  }

  return 0;
}
