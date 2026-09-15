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
import { deleteProjectGrant } from '../../util/kms/grants';
import { handleKmsApiError } from '../../util/kms/errors';
import {
  invalidArgumentCount,
  kmsSuggestion,
  missingArgument,
} from '../../util/kms/args';
import {
  isProjectGrant,
  type Issuer,
  type ProjectGrantPolicy,
} from '../../util/kms/types';
import { KmsRmGrantTelemetryClient } from '../../util/telemetry/commands/kms/rm-grant';
import { removeGrantSubcommand } from './command';

const USAGE = 'kms rm-grant <issuerId> <projectId>';

export default async function rmGrant(client: Client, argv: string[]) {
  const telemetry = new KmsRmGrantTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    removeGrantSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;
  const [issuerId, projectId] = args;

  telemetry.trackCliArgumentIssuerId(issuerId);
  telemetry.trackCliArgumentProjectId(projectId);
  telemetry.trackCliFlagYes(opts['--yes']);

  if (!issuerId) {
    return missingArgument(client, {
      reason: AGENT_REASON.MISSING_ISSUER_ID,
      message: 'An issuer ID is required.',
      usage: `${USAGE} --yes`,
    });
  }
  if (!projectId) {
    return missingArgument(client, {
      reason: AGENT_REASON.MISSING_PROJECT,
      message: `A project ID is required. Run ${getCommandNamePlain(
        `kms inspect ${issuerId}`
      )} to list the issuer's grants.`,
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
          'Removing a grant stops the project from signing new tokens with this issuer. Re-run with --yes to confirm.',
        next: [{ command: buildCommandWithYes(client.argv) }],
      },
      1
    );
  }

  const { contextName } = await getScope(client);

  // Resolve the grant first so the confirmation names the environments that
  // lose access. Anyone allowed to delete a grant can also read it.
  let grant: ProjectGrantPolicy | undefined;
  if (!skipConfirmation) {
    output.spinner(`Fetching issuer ${issuerId}`);
    let issuer: Issuer;
    try {
      issuer = await getIssuer(client, issuerId);
    } catch (err: unknown) {
      output.stopSpinner();
      const handled = handleKmsApiError(client, err, {
        notFound: `Issuer not found: ${issuerId}.`,
        attempted: 'Removing a project grant',
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

    grant = issuer.policies
      .filter(isProjectGrant)
      .find(policy => policy.projectId === projectId);

    if (!grant) {
      const message = `No grant for project ${projectId} on issuer ${issuerId}.`;
      output.error(message);
      output.log(
        `Run ${getCommandName(`kms inspect ${issuerId}`)} to list its grants.`
      );
      return 1;
    }

    printAlignedLabel('Issuer', issuer.id);
    printAlignedLabel('Project', grant.projectId);
    printAlignedLabel('Environments', grant.environments.join(', '));
    output.print('\n');
    const confirmed = await client.input.confirm(
      `Remove ${param(grant.projectId)}'s access to this issuer?`,
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  if (!client.nonInteractive) {
    output.spinner(`Removing grant for ${projectId}`);
  }

  try {
    await deleteProjectGrant(client, issuerId, projectId);
  } catch (err: unknown) {
    output.stopSpinner();
    const handled = handleKmsApiError(client, err, {
      notFound: `No grant for project ${projectId} on issuer ${issuerId}.`,
      attempted: 'Removing a project grant',
      contextName,
      next: [
        {
          command: kmsSuggestion(`kms inspect ${issuerId}`, client.argv),
          when: "List the issuer's grants",
        },
      ],
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
          grant: { issuerId, projectId },
          message: `Grant for project ${projectId} removed.`,
          next: [
            {
              command: getCommandNamePlain(`kms inspect ${issuerId}`),
              when: "Show the issuer's remaining grants",
            },
          ],
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  printAlignedLabel('Removed', projectId, { gutter: '✓' });
  printAlignedLabel('Issuer', issuerId);
  printAlignedLabel('Team', contextName);

  return 0;
}
