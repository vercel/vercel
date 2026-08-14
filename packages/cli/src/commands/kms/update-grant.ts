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
import { updateProjectGrant } from '../../util/kms/grants';
import type { UpdateProjectGrantPayload } from '../../util/kms/grants';
import { handleKmsApiError } from '../../util/kms/errors';
import {
  invalidArgumentCount,
  invalidInput,
  kmsSuggestion,
  missingArgument,
} from '../../util/kms/args';
import { parseJsonObjectFlag } from '../../util/kms/parse-json-input';
import {
  findInvalidEnvironments,
  invalidEnvironmentsMessage,
} from '../../util/kms/environments';
import type { ProjectGrantPolicy } from '../../util/kms/types';
import { KmsUpdateGrantTelemetryClient } from '../../util/telemetry/commands/kms/update-grant';
import { updateGrantSubcommand } from './command';

const USAGE = 'kms update-grant <issuerId> <projectId>';

export default async function updateGrant(client: Client, argv: string[]) {
  const telemetry = new KmsUpdateGrantTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    updateGrantSubcommand.options
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
  telemetry.trackCliOptionEnvironment(opts['--environment']);
  telemetry.trackCliOptionTokenClaims(opts['--token-claims']);
  telemetry.trackCliFlagRemoveTokenClaims(opts['--remove-token-claims']);
  telemetry.trackCliOptionFormat(opts['--format']);
  telemetry.trackCliFlagJson(opts['--json']);

  if (!issuerId) {
    return missingArgument(client, {
      reason: AGENT_REASON.MISSING_ISSUER_ID,
      message: 'An issuer ID is required.',
      usage: USAGE,
    });
  }
  if (!projectId) {
    return missingArgument(client, {
      reason: AGENT_REASON.MISSING_PROJECT,
      message: `A project ID is required. Run ${getCommandNamePlain(
        `kms inspect ${issuerId}`
      )} to list the issuer's grants.`,
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

  const tokenClaimsFlag = opts['--token-claims'];
  const removeTokenClaims = opts['--remove-token-claims'];
  const environments = opts['--environment']
    ? Array.from(new Set(opts['--environment']))
    : undefined;

  if (tokenClaimsFlag && removeTokenClaims) {
    return invalidInput(
      client,
      '--token-claims and --remove-token-claims conflict. Pass one or the other.'
    );
  }
  if (!environments && !tokenClaimsFlag && !removeTokenClaims) {
    return invalidInput(
      client,
      'Nothing to update. Pass --environment, --token-claims, or --remove-token-claims.'
    );
  }

  if (environments) {
    const invalidEnvironments = findInvalidEnvironments(environments);
    if (invalidEnvironments.length > 0) {
      return invalidInput(
        client,
        invalidEnvironmentsMessage(invalidEnvironments)
      );
    }
  }

  let tokenClaims: JSONObject | undefined;
  if (tokenClaimsFlag) {
    try {
      tokenClaims = await parseJsonObjectFlag(
        client,
        '--token-claims',
        tokenClaimsFlag
      );
    } catch (err) {
      return invalidInput(client, (err as Error).message);
    }
  }

  const payload: UpdateProjectGrantPayload = {
    ...(environments && { environments }),
    ...(tokenClaims && { tokenClaims }),
    // `null` is the API's clear signal, so it has to be sent explicitly.
    ...(removeTokenClaims && { tokenClaims: null }),
  };

  const { contextName } = await getScope(client);
  if (!client.nonInteractive) {
    output.spinner(`Updating grant for ${projectId} on ${issuerId}`);
  }

  let grant: ProjectGrantPolicy;
  try {
    grant = await updateProjectGrant(client, issuerId, projectId, payload);
  } catch (err: unknown) {
    output.stopSpinner();
    const handled = handleKmsApiError(client, err, {
      notFound: `Couldn't find a grant for project ${projectId} on issuer ${issuerId}.`,
      attempted: 'Updating a project grant',
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

  if (asJson) {
    const jsonOutput = client.nonInteractive
      ? {
          status: AGENT_STATUS.OK,
          grant,
          message: `Grant for project ${grant.projectId} updated.`,
          next: [
            {
              command: getCommandNamePlain(`kms inspect ${issuerId}`),
              when: "Show the issuer's grants",
            },
          ],
        }
      : grant;
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
    return 0;
  }

  printAlignedLabel('Updated', grant.projectId, { gutter: '✓' });
  printAlignedLabel('Issuer', issuerId);
  printAlignedLabel('Environments', grant.environments.join(', '));
  printAlignedLabel(
    'Token Claims',
    grant.tokenClaims ? 'set' : chalk.gray('none')
  );

  output.print('\n');
  output.log(
    `Inspect the issuer: ${getCommandName(`kms inspect ${issuerId}`)}`
  );

  return 0;
}
