import chalk from 'chalk';
import { errorToString } from '@vercel/error-utils';
import * as ERRORS from '../../util/errors-ts';
import { getContextName } from '../../util/get-scope';
import isRootDomain from '../../util/is-root-domain';
import param from '../../util/output/param';
import updateAutoRenew from '../../util/domains/update-auto-renew';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { DomainsAutoRenewTelemetryClient } from '../../util/telemetry/commands/domains/auto-renew';
import type Client from '../../util/client';
import { autoRenewSubcommand } from './command';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { canPrompt } from '../../util/can-prompt';
import {
  outputAgentError,
  shouldEmitNonInteractiveCommandError,
} from '../../util/agent-output';
import {
  AGENT_REASON,
  AGENT_STATUS,
  getExitCodeForReason,
} from '../../util/agent-output-constants';

const ON = 'on';
const OFF = 'off';

/**
 * `vercel domains auto-renew enable|disable <domain>`. The old
 * `auto-renew <domain> <on|off>` form still works and warns.
 */
export default async function autoRenew(client: Client, argv: string[]) {
  const telemetry = new DomainsAutoRenewTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(autoRenewSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: error instanceof Error ? error.message : String(error),
    });
    printError(error);
    return 2;
  }
  const { args } = parsedArgs;
  const action =
    args[0] === 'enable' || args[0] === 'disable' ? args[0] : undefined;
  const [domainName, state] = action ? args.slice(1) : args;

  if (action === 'enable') {
    telemetry.trackCliSubcommandEnable(action);
  } else if (action === 'disable') {
    telemetry.trackCliSubcommandDisable(action);
  }
  telemetry.trackCliArgumentDomain(domainName);
  if (!action) {
    telemetry.trackCliArgumentState(state);
  }
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);
  telemetry.trackCliFlagJson(parsedArgs.flags['--json']);

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    outputAgentError(client, {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: formatResult.error,
    });
    output.error(formatResult.error);
    return 2;
  }

  const { jsonOutput } = formatResult;
  const asJson = jsonOutput || !canPrompt(client);

  function fail(
    reason: string,
    message: string,
    humanMessage: string = message
  ): number {
    if (shouldEmitNonInteractiveCommandError(client)) {
      outputAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason,
        message,
      });
      return getExitCodeForReason(reason);
    }
    if (jsonOutput || !canPrompt(client)) {
      client.stdout.write(
        `${JSON.stringify(
          { status: AGENT_STATUS.ERROR, reason, domain: domainName, message },
          null,
          2
        )}\n`
      );
      return getExitCodeForReason(reason);
    }
    output.error(humanMessage);
    return getExitCodeForReason(reason);
  }

  if (args.length !== 2 || !domainName || (!action && !state)) {
    const usage = getCommandName(
      `domains auto-renew ${action ?? 'enable|disable'} <domain>`
    );
    return fail(
      AGENT_REASON.MISSING_ARGUMENTS,
      `Invalid number of arguments. Usage: ${usage}`,
      `Invalid number of arguments. Usage: ${chalk.cyan(usage)}`
    );
  }

  if (!isRootDomain(domainName)) {
    return fail(
      AGENT_REASON.INVALID_DOMAIN,
      `Invalid domain name "${domainName}".`,
      `Invalid domain name "${domainName}". Run ${getCommandName(
        `domains --help`
      )}`
    );
  }

  if (!action && state !== ON && state !== OFF) {
    return fail(
      AGENT_REASON.INVALID_ARGUMENTS,
      `Invalid state "${state}". Expected ${ON} or ${OFF}.`,
      `Invalid state "${state}". Expected ${chalk.bold(ON)} or ${chalk.bold(
        OFF
      )}.`
    );
  }

  const enabled = action ? action === 'enable' : state === ON;
  if (!action) {
    warnDeprecatedSubcommand(
      client,
      `domains auto-renew ${domainName} ${state}`,
      `domains auto-renew ${enabled ? 'enable' : 'disable'} ${domainName}`
    );
  }
  const contextName = await getContextName(client);

  if (!asJson) {
    output.spinner(
      `${enabled ? 'Enabling' : 'Disabling'} automatic renewal for ${domainName}`
    );
  }

  try {
    await updateAutoRenew(client, domainName, enabled);
  } catch (err: unknown) {
    output.stopSpinner();
    if (ERRORS.isAPIError(err)) {
      switch (err.code) {
        case 'domain_not_registered':
          return fail(
            'domain_not_registered',
            `The domain ${domainName} is not registered with Vercel.`,
            `The domain ${param(domainName)} is not registered with Vercel.`
          );
        case 'domain_not_found':
          return fail(
            AGENT_REASON.DOMAIN_NOT_FOUND,
            `Domain ${domainName} not found under ${contextName}.`,
            `Domain ${param(domainName)} not found under ${chalk.bold(
              contextName
            )}.`
          );
        case 'domain_not_renewable':
          return fail(
            'domain_not_renewable',
            `The domain ${domainName} cannot be renewed, so automatic renewal can't be changed.`
          );
        case 'domain_already_renewing':
          return fail(
            'domain_already_renewing',
            `The domain ${domainName} is already renewing, so automatic renewal can't be changed right now.`
          );
        case 'forbidden':
          return fail(
            'forbidden',
            `You don't have permission to update ${domainName} under ${contextName}.`,
            `You don't have permission to update ${param(
              domainName
            )} under ${chalk.bold(contextName)}.`
          );
        default:
          return fail(AGENT_REASON.API_ERROR, err.serverMessage || err.message);
      }
    }
    output.debug(`Server response: ${errorToString(err)}`);
    return fail(
      AGENT_REASON.API_ERROR,
      'An unexpected error occurred while updating automatic renewal. Please try again later.'
    );
  }

  output.stopSpinner();

  const message = enabled
    ? `Automatic renewal turned on for ${domainName}`
    : `Automatic renewal turned off for ${domainName}`;

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          status: AGENT_STATUS.OK,
          domain: domainName,
          autoRenew: enabled,
          message,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  output.success(
    `${enabled ? 'Enabled' : 'Disabled'} automatic renewal for ${param(
      domainName
    )}`
  );
  return 0;
}
