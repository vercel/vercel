import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import param from '../../util/output/param';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { buildCommandWithYes, outputAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import output from '../../output-manager';
import { getIssuer } from '../../util/kms/issuers';
import { revokeSigningKey } from '../../util/kms/signing-keys';
import { handleKmsApiError } from '../../util/kms/errors';
import {
  invalidArgumentCount,
  kmsSuggestion,
  missingArgument,
} from '../../util/kms/args';
import { describeKeyStatus } from '../../util/kms/format';
import type { Issuer } from '../../util/kms/types';
import { KmsRevokeKeyTelemetryClient } from '../../util/telemetry/commands/kms/revoke-key';
import { revokeKeySubcommand } from './command';

const USAGE = 'kms revoke-key <issuerId> <keyId>';

export default async function revokeKey(client: Client, argv: string[]) {
  const telemetry = new KmsRevokeKeyTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(revokeKeySubcommand.options);
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
  telemetry.trackCliFlagYes(opts['--yes']);

  if (!issuerId) {
    return missingArgument(client, {
      reason: AGENT_REASON.MISSING_ISSUER_ID,
      message: 'An issuer ID is required.',
      usage: `${USAGE} --yes`,
    });
  }
  if (!keyId) {
    return missingArgument(client, {
      reason: AGENT_REASON.MISSING_KEY_ID,
      message: `A key ID is required. Run ${getCommandNamePlain(
        `kms inspect ${issuerId}`
      )} to list the issuer's keys.`,
      usage: `${USAGE} --yes`,
    });
  }
  if (args.length > 2) {
    return invalidArgumentCount(client, USAGE);
  }

  const skipConfirmation = opts['--yes'] || false;
  if (client.nonInteractive && !skipConfirmation) {
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.CONFIRMATION_REQUIRED,
        message:
          'Revoking a key ends its grace period immediately, so tokens it signed stop verifying. Re-run with --yes to confirm.',
        next: [{ command: buildCommandWithYes(client.argv) }],
      },
      1
    );
  }

  const { contextName } = await getScope(client);

  // Only a key already scheduled for revocation can be revoked, so resolve it
  // first and reject the other states without calling the mutation.
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
      attempted: 'Revoking a signing key',
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

  const key = issuer.signingKeys.find(candidate => candidate.keyId === keyId);
  const inspectCommand = kmsSuggestion(`kms inspect ${issuerId}`, client.argv);

  if (!key) {
    const message = `Key not found: ${keyId} on issuer ${issuerId}.`;
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.NOT_FOUND,
        message,
        next: [{ command: inspectCommand, when: "List the issuer's keys" }],
      },
      1
    );
    output.error(message);
    output.log(
      `Run ${getCommandName(`kms inspect ${issuerId}`)} to list its keys.`
    );
    return 1;
  }

  if (key.status !== 'revoking') {
    const message = `Key ${keyId} is ${key.status}, not scheduled for revocation. Only a key already retiring can be revoked immediately; activate a replacement key first.`;
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.KEY_NOT_REVOKING,
        message,
        next: [
          {
            command: kmsSuggestion(`kms add-key ${issuerId}`, client.argv),
            when: 'Rotate to a new key, which retires this one',
          },
        ],
      },
      1
    );
    output.error(message);
    return 1;
  }

  if (!skipConfirmation) {
    printAlignedLabel('Issuer', issuer.id);
    printAlignedLabel('Key', key.keyId);
    printAlignedLabel('Status', describeKeyStatus(key));
    output.print('\n');
    const confirmed = await client.input.confirm(
      `Revoke ${param(key.keyId)} now? Tokens it signed stop verifying.`,
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  if (!client.nonInteractive) {
    output.spinner(`Revoking key ${key.keyId}`);
  }

  let updated: Issuer;
  try {
    updated = await revokeSigningKey(client, issuerId, key.keyId);
  } catch (err: unknown) {
    output.stopSpinner();
    const handled = handleKmsApiError(client, err, {
      notFound: `Key not found: ${key.keyId} on issuer ${issuerId}.`,
      attempted: 'Revoking a signing key',
      contextName,
    });
    if (handled !== undefined) {
      return handled;
    }
    throw err;
  }

  output.stopSpinner();

  if (client.nonInteractive) {
    client.stdout.write(
      `${JSON.stringify(
        {
          status: AGENT_STATUS.OK,
          issuer: updated,
          message: `Signing key ${key.keyId} revoked.`,
          next: [
            {
              command: getCommandNamePlain(`kms inspect ${issuerId}`),
              when: "Show the issuer's remaining keys",
            },
          ],
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  printAlignedLabel('Revoked', key.keyId, { gutter: '✓' });
  printAlignedLabel('Issuer', updated.id);
  printAlignedLabel('Signing Keys', String(updated.signingKeys.length));

  return 0;
}
