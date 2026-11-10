import chalk from 'chalk';
import { errorToString } from '@vercel/error-utils';
import * as ERRORS from '../../util/errors-ts';
import getDomainPrice from '../../util/domains/get-domain-price';
import getScope from '../../util/get-scope';
import isRootDomain from '../../util/is-root-domain';
import param from '../../util/output/param';
import renewDomain from '../../util/domains/renew-domain';
import { getOrderOutcome } from '../../util/domains/get-order';
import stamp from '../../util/output/stamp';
import { getCommandNamePlain } from '../../util/pkg-name';
import output from '../../output-manager';
import { DomainsRenewTelemetryClient } from '../../util/telemetry/commands/domains/renew';
import type Client from '../../util/client';
import { renewSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { buildCommandWithGlobalFlags } from '../../util/agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';

import {
  amountMatchesPrice,
  canPromptForCharge,
  chargeFailureReason,
  formatAmountArg,
  formatTerm,
  parseAmount,
  printChargeRecovery,
  reportChargeFailure,
  reportPriceChanged,
  reportUnknownOutcome,
  reportUsageError,
  refuseUnnamedTeam,
  writeChargeAction,
} from '../../util/domains/domain-charge';
import { validateJsonOutput } from '../../util/output-format';
import { formatUsd } from '../../util/budget/api';

export default async function renew(client: Client, argv: string[]) {
  const telemetry = new DomainsRenewTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(renewSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }
  const { args, flags: opts } = parsedArgs;
  const [domainName] = args;

  telemetry.trackCliArgumentDomain(domainName);
  telemetry.trackCliOptionAmount(opts['--amount']);
  telemetry.trackCliFlagJson(opts['--json']);
  telemetry.trackCliOptionFormat(opts['--format']);

  if (args.length !== 1 || !domainName) {
    return reportUsageError(
      client,
      AGENT_REASON.MISSING_ARGUMENTS,
      `Invalid number of arguments. Usage: ${getCommandNamePlain(
        'domains renew <domain>'
      )}`
    );
  }

  if (!isRootDomain(domainName)) {
    return reportUsageError(
      client,
      AGENT_REASON.INVALID_DOMAIN,
      `Invalid domain name "${domainName}". Use a registrable root domain (no subdomain).`
    );
  }

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    return reportUsageError(
      client,
      AGENT_REASON.INVALID_ARGUMENTS,
      formatResult.error
    );
  }
  const asJson = formatResult.jsonOutput;

  const amount = parseAmount(opts['--amount']);
  if (amount instanceof Error) {
    return reportUsageError(
      client,
      AGENT_REASON.INVALID_ARGUMENTS,
      amount.message
    );
  }

  const { contextName, team } = await getScope(client);
  const teamSlug = team?.slug;

  const domainPrice = await getDomainPrice(client, domainName);
  if (domainPrice instanceof Error) {
    return reportChargeFailure(client, asJson, {
      reason: chargeFailureReason(domainPrice),
      message: domainPrice.message,
    });
  }

  const { years, renewalPrice } = domainPrice;
  if (renewalPrice === null) {
    return reportChargeFailure(client, asJson, {
      reason: AGENT_REASON.API_ERROR,
      message: `The renewal price for ${domainName} is not available. This domain may not be renewable.`,
    });
  }

  const term = `${years}yr${years > 1 ? 's' : ''}`;

  const renewCommand = (price?: number) =>
    buildCommandWithGlobalFlags(
      client.argv,
      `domains renew ${domainName}${teamSlug ? ` --scope ${teamSlug}` : ''}${
        price === undefined ? '' : ` --amount ${formatAmountArg(price)}`
      }${asJson ? ' --json' : ''}`
    );
  const inspectCommand = buildCommandWithGlobalFlags(
    client.argv,
    `domains inspect ${domainName}`
  );

  if (amount !== undefined && !amountMatchesPrice(amount, renewalPrice)) {
    return reportPriceChanged(client, {
      verb: 'renew',
      domain: domainName,
      amount,
      price: renewalPrice,
      nextCommand: renewCommand(renewalPrice),
      json: asJson,
    });
  }

  if (amount === undefined) {
    if (!canPromptForCharge(client, asJson)) {
      // Without a terminal, the approved price is the consent: nothing is
      // charged until the command runs again with --amount.
      const headline = `Can't renew ${domainName} without an approved price (--amount) in non-interactive mode.`;
      const priceLine = `Price: ${formatUsd(renewalPrice)} for ${formatTerm(years)}, charged to ${contextName}.`;
      const command = renewCommand(renewalPrice);
      writeChargeAction(client, asJson, {
        status: AGENT_STATUS.ACTION_REQUIRED,
        reason: AGENT_REASON.CONFIRMATION_REQUIRED,
        action: AGENT_ACTION.CONFIRMATION_REQUIRED,
        message: `${headline} ${priceLine}`,
        userActionRequired: true,
        hint: 'Show the user the renewal price and get their approval before running next[].',
        data: {
          domain: domainName,
          ...(teamSlug && { team: teamSlug }),
          amount: renewalPrice,
          currency: 'USD',
          years,
        },
        missing: ['--amount'],
        next: [
          {
            command,
            when: `Only after a human approves: charges ${formatUsd(renewalPrice)} now`,
          },
        ],
      });
      printChargeRecovery(
        `${headline}\n${priceLine}`,
        'Once a person approves the price, run',
        command
      );
      return 1;
    }

    output.log(
      `An email with the invoice and transaction details will be sent to you after renewal.`
    );
    const confirmed = await client.input.confirm(
      `Renew ${param(domainName)} now for ${chalk.bold(formatUsd(renewalPrice))} (${formatTerm(years)})?`,
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  // The person running the command has to name the team that pays.
  if (!canPromptForCharge(client, asJson) && team) {
    const refused = refuseUnnamedTeam(client, asJson, {
      verb: 'renew',
      domain: domainName,
      team,
      nextCommand: renewCommand(renewalPrice),
    });
    if (refused !== undefined) return refused;
  }

  const renewStamp = stamp();
  output.spinner(`Renewing ${domainName}`);

  let order;
  try {
    order = await renewDomain(client, domainName, renewalPrice, years);
  } catch (err: unknown) {
    output.stopSpinner();
    output.debug(`Server response: ${errorToString(err)}`);
    if (ERRORS.isAPIError(err)) {
      if (err.code === 'expected_price_mismatch') {
        return reportPriceChanged(client, {
          verb: 'renew',
          domain: domainName,
          amount: renewalPrice,
          nextCommand: renewCommand(),
          json: asJson,
        });
      }
      const known: Record<string, [string, string]> = {
        domain_not_registered: [
          AGENT_REASON.DOMAIN_NOT_FOUND,
          `The domain ${domainName} is not registered with Vercel.`,
        ],
        domain_not_found: [
          AGENT_REASON.DOMAIN_NOT_FOUND,
          `Domain ${domainName} not found under ${contextName}.`,
        ],
        tld_not_supported: [
          AGENT_REASON.TLD_NOT_SUPPORTED,
          `The TLD for domain name ${domainName} is not supported.`,
        ],
        forbidden: [
          AGENT_REASON.PERMISSION_DENIED,
          `You don't have permission to renew ${domainName} under ${contextName}.`,
        ],
      };
      const [reason, message] = known[err.code] ?? [];
      if (reason && message) {
        return reportChargeFailure(client, asJson, { reason, message });
      }
      return reportChargeFailure(
        client,
        asJson,
        {
          reason: AGENT_REASON.API_ERROR,
          message: `Couldn't renew ${domainName}. The API returned an error (${err.code}). Nothing was charged.`,
        },
        { apiMessage: err.serverMessage }
      );
    }
    // `renewDomain` only throws when nothing was charged; a possible charge
    // comes back as `null`. So this failed before the request was sent.
    return reportChargeFailure(client, asJson, {
      reason: AGENT_REASON.API_ERROR,
      message: `Couldn't renew ${domainName}. The request wasn't sent, so nothing was charged.`,
    });
  }

  output.stopSpinner();

  // A 5xx, a lost connection, or an order that didn't finish in time: the
  // renewal may still have gone through.
  if (order instanceof ERRORS.DomainChargeOutcomeUnknown) {
    return reportUnknownOutcome(client, asJson, {
      verb: 'renew',
      domain: domainName,
      inspectCommand,
    });
  }

  const outcome = getOrderOutcome(order, domainName);
  if (outcome === 'unknown') {
    return reportUnknownOutcome(client, asJson, {
      verb: 'renew',
      domain: domainName,
      inspectCommand,
    });
  }
  if (outcome !== 'completed') {
    return reportChargeFailure(client, asJson, {
      reason:
        outcome === 'payment_failed'
          ? AGENT_REASON.PAYMENT_FAILED
          : AGENT_REASON.API_ERROR,
      message: {
        payment_failed: 'Your card was declined. Nothing was charged.',
        refunded: `Renewal for ${domainName} failed, and the charge was refunded.`,
        refund_failed: `Renewal for ${domainName} failed, and refunding the charge also failed. Contact Vercel support about the charge.`,
        failed: `Renewal for ${domainName} failed.`,
      }[outcome],
    });
  }

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          status: AGENT_STATUS.OK,
          domain: domainName,
          term,
          years,
          price: renewalPrice,
          charge: { amount: renewalPrice, currency: 'USD' },
          orderId: order.orderId,
          message: `Domain ${domainName} renewed.`,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  // stdout carries the renewed domain; everything else is on stderr.
  client.stdout.write(`${domainName}\n`);
  output.success(`Domain ${param(domainName)} renewed ${renewStamp()}`);
  output.log(`Charged ${formatUsd(renewalPrice)} for ${formatTerm(years)}.`);
  return 0;
}
