import chalk from 'chalk';
import open from 'open';
import output from '../../output-manager';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getScope from '../../util/get-scope';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import {
  buildCommandWithGlobalFlags,
  outputActionRequired,
  shouldEmitNonInteractiveCommandError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { packageName } from '../../util/pkg-name';
import { getResources } from '../../util/integration-resource/get-resources';
import {
  createClaimUrl,
  ClaimUrlError,
} from '../../util/integration-resource/create-claim-url';
import { pollForClaim } from '../../util/integration-resource/poll-for-claim';
import { isSandboxResource } from '../../util/integration-resource/claim-status';
import { IntegrationResourceClaimTelemetryClient } from '../../util/telemetry/commands/integration-resource/claim';
import type { Resource } from '../../util/integration-resource/types';
import { claimSubcommand } from './command';

interface ClaimJsonOutput {
  resource: { id: string; name: string };
  claimUrl: string;
  status: 'url_generated' | 'claimed' | 'timeout';
}

export async function claim(client: Client, argv: string[]) {
  const telemetry = new IntegrationResourceClaimTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArguments = null;
  const flagsSpecification = getFlagsSpecification(claimSubcommand.options);

  try {
    parsedArguments = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const formatResult = validateJsonOutput(parsedArguments.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;
  const skipConfirmation = !!parsedArguments.flags['--yes'];
  const noWait = !!parsedArguments.flags['--no-wait'];

  telemetry.trackCliOptionFormat(parsedArguments.flags['--format']);
  telemetry.trackCliFlagYes(skipConfirmation);
  telemetry.trackCliFlagNoWait(noWait);

  if (parsedArguments.args.length > 1) {
    output.error(
      'Too many arguments. Usage: `vercel integration-resource claim [name]`.'
    );
    return 1;
  }

  const resourceNameArg: string | undefined = parsedArguments.args[0];
  telemetry.trackCliArgumentResource(resourceNameArg);

  const { team } = await getScope(client);
  if (!team) {
    output.error('Team not found.');
    return 1;
  }
  client.config.currentTeam = team.id;

  output.spinner('Retrieving resources…', 500);
  let allResources: Resource[];
  try {
    allResources = await getResources(client);
  } catch (error) {
    output.stopSpinner();
    output.error(`Failed to fetch resources: ${(error as Error).message}`);
    return 1;
  }
  output.stopSpinner();

  let targetResource: Resource | undefined;

  if (resourceNameArg) {
    targetResource = allResources.find(r => r.name === resourceNameArg);
    if (!targetResource) {
      output.error(`No resource named '${resourceNameArg}' found.`);
      return 1;
    }
  } else {
    // No arg: pick or confirm from sandbox-ownership resources.
    if (!client.stdin.isTTY) {
      output.error(
        'Missing resource name. Run `vercel integration list` to see available resources.'
      );
      return 1;
    }

    const sandboxResources = allResources.filter(isSandboxResource);

    if (sandboxResources.length === 0) {
      output.log('No sandbox resources to claim in the current project.');
      return 0;
    }

    if (sandboxResources.length === 1) {
      const only = sandboxResources[0];
      if (skipConfirmation) {
        targetResource = only;
      } else {
        const productLabel = only.product?.name
          ? ` (${only.product.name} sandbox)`
          : '';
        const confirmed = await client.input.confirm(
          `Claim ${chalk.bold(only.name)}${productLabel}?`,
          true
        );
        if (!confirmed) {
          output.log('Canceled');
          return 0;
        }
        targetResource = only;
      }
    } else {
      const choice = await client.input.select({
        message: 'Which sandbox resource would you like to claim?',
        choices: sandboxResources.map(r => ({
          name: r.product?.name ? `${r.name} (${r.product.name})` : r.name,
          value: r.id,
        })),
      });
      targetResource = sandboxResources.find(r => r.id === choice);
      if (!targetResource) {
        output.error('No resource selected.');
        return 1;
      }
    }
  }

  return runClaimForResource(client, targetResource, { asJson, noWait });
}

export interface RunClaimOptions {
  asJson?: boolean;
  noWait?: boolean;
  /**
   * When true, suppress the non-TTY action_required JSON output and instead
   * return exit code 1 with a hint printed to stderr. Used by `vercel
   * integration add` so the add JSON output is not preempted.
   */
  suppressActionRequired?: boolean;
}

/**
 * Shared implementation for the claim flow, used by the standalone `claim`
 * command and by `integration add`'s auto-offer. Assumes the caller has
 * already resolved the team scope and the target resource.
 */
export async function runClaimForResource(
  client: Client,
  targetResource: Resource,
  options: RunClaimOptions = {}
): Promise<number> {
  const { asJson, noWait, suppressActionRequired } = options;

  // Defensive: if the user named a non-sandbox resource, surface a clean error
  // without hitting the API. Distinguish "already claimed" (was a sandbox,
  // now isn't) from "never was a sandbox" (wrong resource type entirely) so
  // the message is actionable.
  if (!isSandboxResource(targetResource)) {
    const alreadyClaimed =
      targetResource.ownership === 'owned' ||
      targetResource.ownership === 'linked';
    output.error(
      alreadyClaimed
        ? `'${targetResource.name}' can no longer be claimed (already claimed). Run \`${packageName} integration list\` to refresh.`
        : `'${targetResource.name}' is not a sandbox resource and cannot be claimed.`
    );
    return 1;
  }

  // Fetch the claim URL.
  output.spinner('Requesting claim URL…', 500);
  let claimUrl: string;
  try {
    const response = await createClaimUrl(client, targetResource);
    claimUrl = response.claimUrl;
  } catch (error) {
    output.stopSpinner();
    if (error instanceof ClaimUrlError) {
      output.error(error.message);
      return 1;
    }
    output.error(
      `A problem occurred while requesting the claim URL: ${(error as Error).message}`
    );
    return 1;
  }
  output.stopSpinner();

  // Non-interactive mode: emit structured action_required payload and exit 1.
  // Done before any browser open so AI agents / CI don't spawn a browser
  // they have no way to interact with.
  if (!suppressActionRequired && shouldEmitNonInteractiveCommandError(client)) {
    outputActionRequired(
      client,
      {
        status: 'action_required',
        reason: AGENT_REASON.INTEGRATION_SANDBOX_CLAIM_REQUIRED,
        message: `Claim "${targetResource.name}" in your browser to finish provisioning. Open verification_uri to start. This command does not wait for the claim in non-interactive mode.`,
        verification_uri: claimUrl,
        userActionRequired: true,
        hint: `Open verification_uri in a browser, complete the provider's claim flow, then run \`${packageName} integration list\` to confirm \`ownership\` flipped from sandbox to linked.`,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'integration list',
              packageName,
              { prependGlobalFlags: true }
            ),
            when: 'After claiming in the browser, verify ownership flipped to linked',
          },
        ],
      },
      1
    );
  }

  // --no-wait: print the URL (and optional JSON) and exit 0 without polling
  // or opening a browser — caller asked for the URL only.
  if (noWait) {
    if (asJson) {
      const json: ClaimJsonOutput = {
        resource: { id: targetResource.id, name: targetResource.name },
        claimUrl,
        status: 'url_generated',
      };
      client.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
    } else {
      output.log(
        `Visit this URL to claim ${chalk.bold(targetResource.name)}: ${claimUrl}`
      );
      output.log(
        `Re-run \`${packageName} integration list\` after claiming to verify.`
      );
    }
    return 0;
  }

  // Non-TTY without --no-wait: don't poll (no human to watch) and don't open
  // a browser (no desktop session to receive focus).
  if (!client.stdin.isTTY) {
    if (asJson) {
      const json: ClaimJsonOutput = {
        resource: { id: targetResource.id, name: targetResource.name },
        claimUrl,
        status: 'url_generated',
      };
      client.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
    } else {
      output.log(
        `Visit this URL to claim ${chalk.bold(targetResource.name)}: ${claimUrl}`
      );
      output.log(
        `Re-run \`${packageName} integration list\` after claiming to verify.`
      );
    }
    return suppressActionRequired ? 0 : 1;
  }

  // TTY interactive: open browser and poll for completion.
  output.log(`Opening browser to claim ${chalk.bold(targetResource.name)}…`);
  output.log(`Visit this URL if the browser does not open: ${claimUrl}`);
  try {
    await open(claimUrl);
  } catch (err) {
    output.debug(`Failed to open browser: ${err}`);
  }

  const result = await pollForClaim(client, targetResource.id);

  if (result.status === 'cancelled') {
    // POSIX SIGINT exit convention (128 + signal number).
    return 130;
  }

  if (result.status === 'timeout') {
    if (asJson) {
      const json: ClaimJsonOutput = {
        resource: { id: targetResource.id, name: targetResource.name },
        claimUrl,
        status: 'timeout',
      };
      client.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
    }
    return 1;
  }

  const claimed = result.resource;

  if (asJson) {
    const json: ClaimJsonOutput = {
      resource: { id: claimed.id, name: claimed.name },
      claimUrl,
      status: 'claimed',
    };
    client.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
    return 0;
  }

  output.success(`Claimed ${chalk.bold(claimed.name)}.`);
  return 0;
}
