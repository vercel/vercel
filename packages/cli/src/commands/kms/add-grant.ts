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
import { createProjectGrant } from '../../util/kms/grants';
import { handleKmsApiError } from '../../util/kms/errors';
import {
  invalidArgumentCount,
  invalidInput,
  kmsSuggestion,
  missingArgument,
} from '../../util/kms/args';
import { parseJsonObjectFlag } from '../../util/kms/parse-json-input';
import type { ProjectGrantPolicy } from '../../util/kms/types';
import { KmsAddGrantTelemetryClient } from '../../util/telemetry/commands/kms/add-grant';
import { addGrantSubcommand } from './command';

const USAGE =
  'kms add-grant <issuerId> --project <projectId> --environment <environment>';

export default async function addGrant(client: Client, argv: string[]) {
  const telemetry = new KmsAddGrantTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(addGrantSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;
  const [issuerId] = args;

  telemetry.trackCliArgumentIssuerId(issuerId);
  telemetry.trackCliOptionProject(opts['--project']);
  telemetry.trackCliOptionEnvironment(opts['--environment']);
  telemetry.trackCliOptionTokenClaims(opts['--token-claims']);
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

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput || client.nonInteractive;

  const projectId = opts['--project'];
  if (!projectId) {
    return missingArgument(client, {
      reason: AGENT_REASON.MISSING_PROJECT,
      message: 'A project is required. Pass --project with the project ID.',
      usage: USAGE,
    });
  }

  // Environments are free-form strings so custom environments work, but the API
  // rejects duplicates.
  const environments = Array.from(new Set(opts['--environment'] ?? []));
  if (environments.length === 0) {
    return missingArgument(client, {
      reason: AGENT_REASON.MISSING_ENVIRONMENT,
      message:
        'At least one environment is required. Pass --environment production, and repeat the flag for more.',
      usage: USAGE,
    });
  }

  let tokenClaims: JSONObject | undefined;
  if (opts['--token-claims']) {
    try {
      tokenClaims = await parseJsonObjectFlag(
        client,
        '--token-claims',
        opts['--token-claims']
      );
    } catch (err) {
      return invalidInput(client, (err as Error).message);
    }
  }

  const { contextName } = await getScope(client);
  if (!client.nonInteractive) {
    output.spinner(`Granting ${projectId} access to ${issuerId}`);
  }

  let grant: ProjectGrantPolicy;
  try {
    grant = await createProjectGrant(client, issuerId, {
      projectId,
      environments,
      ...(tokenClaims && { tokenClaims }),
    });
  } catch (err: unknown) {
    output.stopSpinner();
    const handled = handleKmsApiError(client, err, {
      // The API collapses "no such issuer" and "no such project" into 404s, and
      // never discloses a project the caller can't read.
      notFound: `Couldn't find issuer ${issuerId} or project ${projectId} in ${contextName}.`,
      attempted: 'Adding a project grant',
      contextName,
      next: [
        {
          command: kmsSuggestion('kms ls', client.argv),
          when: 'List issuers in this team',
        },
        {
          command: kmsSuggestion('project ls', client.argv),
          when: 'List projects to find the right ID',
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
          message: `Project ${projectId} can now sign with issuer ${issuerId}.`,
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

  printAlignedLabel('Granted', grant.projectId, { gutter: '✓' });
  printAlignedLabel('Issuer', issuerId);
  printAlignedLabel('Environments', grant.environments.join(', '));
  printAlignedLabel(
    'Token Claims',
    grant.tokenClaims ? 'set' : chalk.gray('none')
  );

  output.print('\n');
  output.log(
    `Deployments in ${grant.environments.join(' and ')} can now sign with this issuer. Inspect it: ${getCommandName(
      `kms inspect ${issuerId}`
    )}`
  );

  return 0;
}
