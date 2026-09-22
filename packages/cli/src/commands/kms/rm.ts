import plural from 'pluralize';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import param from '../../util/output/param';
import { getCommandNamePlain } from '../../util/pkg-name';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { buildCommandWithYes, outputAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import output from '../../output-manager';
import { deleteIssuer, getIssuer } from '../../util/kms/issuers';
import { handleKmsApiError } from '../../util/kms/errors';
import {
  invalidArgumentCount,
  kmsSuggestion,
  missingArgument,
} from '../../util/kms/args';
import type { Issuer } from '../../util/kms/types';
import { KmsRmTelemetryClient } from '../../util/telemetry/commands/kms/rm';
import { removeSubcommand } from './command';

const USAGE = 'kms rm <issuerId>';

export default async function rm(client: Client, argv: string[]) {
  const telemetry = new KmsRmTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(removeSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;
  const [issuerId] = args;

  telemetry.trackCliArgumentIssuerId(issuerId);
  telemetry.trackCliFlagYes(opts['--yes']);

  if (!issuerId) {
    return missingArgument(client, {
      reason: AGENT_REASON.MISSING_ISSUER_ID,
      message: 'An issuer ID is required.',
      usage: `${USAGE} --yes`,
    });
  }
  if (args.length > 1) {
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
          'Deleting an issuer also deletes its signing keys, and tokens it signed stop verifying. Re-run with --yes to confirm.',
        next: [{ command: buildCommandWithYes(client.argv) }],
      },
      1
    );
  }

  const { contextName } = await getScope(client);

  // Resolve the issuer first so the confirmation names what is being deleted.
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
      attempted: 'Deleting an issuer',
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

  if (!skipConfirmation) {
    printAlignedLabel('Issuer', issuer.id);
    printAlignedLabel('Name', issuer.name);
    printAlignedLabel(
      'Signing Keys',
      plural('key', issuer.signingKeys.length, true)
    );
    output.print('\n');
    const confirmed = await client.input.confirm(
      `Delete ${param(issuer.name)} and its signing keys? Tokens it signed stop verifying.`,
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  if (!client.nonInteractive) {
    output.spinner(`Deleting issuer ${issuer.id}`);
  }

  try {
    await deleteIssuer(client, issuer.id);
  } catch (err: unknown) {
    output.stopSpinner();
    const handled = handleKmsApiError(client, err, {
      notFound: `Issuer not found: ${issuer.id}.`,
      attempted: 'Deleting an issuer',
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
          issuer: { id: issuer.id, name: issuer.name },
          message: `Issuer ${issuer.id} deleted.`,
          next: [
            {
              command: getCommandNamePlain('kms ls'),
              when: 'List remaining issuers',
            },
          ],
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  printAlignedLabel('Removed', issuer.name, { gutter: '✓' });
  printAlignedLabel('Issuer', issuer.id);
  printAlignedLabel('Team', contextName);

  return 0;
}
