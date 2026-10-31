import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import { parse } from 'tldts';
import { errorToString } from '@vercel/error-utils';
import * as ERRORS from '../../util/errors-ts';
import getDomainPrice from '../../util/domains/get-domain-price';
import getDomainStatus from '../../util/domains/get-domain-status';
import getScope from '../../util/get-scope';
import param from '../../util/output/param';
import purchaseDomain from '../../util/domains/purchase-domain';
import stamp from '../../util/output/stamp';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import output from '../../output-manager';
import { DomainsBuyTelemetryClient } from '../../util/telemetry/commands/domains/buy';
import type Client from '../../util/client';
import { buySubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import collectContactInformation, {
  CONTACT_FIELDS,
  billingFieldsUsed,
  getBillingContact,
  mergeContact,
  missingContactFields,
  readContactFlags,
  type ContactField,
  type ContactInformation,
  type PartialContact,
} from '../../util/domains/collect-contact-information';
import {
  amountMatchesPrice,
  canPromptForCharge,
  chargeFailureReason,
  chargeFlagWithValue,
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
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
} from '../../util/agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';
import { getGlobalFlagsFromArgs } from '../../util/arg-common';

import { quoteArg } from '../../util/flags/quote-arg';
import { validateJsonOutput } from '../../util/output-format';
import { formatUsd } from '../../util/budget/api';

type BuyCommandOptions = {
  team?: string;
  amount?: number;
  useBilling: boolean;
  contact: PartialContact;
  missing: ContactField[];
  autoRenew?: boolean;
  json: boolean;
};

/**
 * The `domains buy` command to run next: the flags the caller already passed,
 * plus a labeled placeholder for each missing contact field.
 */
function buildBuyCommand(
  client: Client,
  domain: string,
  opts: BuyCommandOptions
): string {
  const parts = [`domains buy ${domain}`];
  if (opts.team) {
    parts.push(`--scope ${opts.team}`);
  }
  if (opts.amount !== undefined) {
    parts.push(`--amount ${formatAmountArg(opts.amount)}`);
  }
  if (opts.useBilling) {
    parts.push('--use-billing-details');
  }
  for (const { field, flag } of CONTACT_FIELDS) {
    const value = opts.contact[field];
    if (value !== undefined) {
      parts.push(`${flag} ${quoteArg(value)}`);
    } else if (opts.missing.includes(field)) {
      parts.push(`${flag} <${flag.slice(2)}>`);
    }
  }
  if (opts.autoRenew === true) parts.push('--auto-renew');
  if (opts.autoRenew === false) parts.push('--no-auto-renew');
  if (opts.json) parts.push('--json');
  return buildCommandWithGlobalFlags(client.argv, parts.join(' '));
}

function flagFor(field: ContactField): string {
  return CONTACT_FIELDS.find(f => f.field === field)!.flag;
}

function usageError(client: Client, message: string): number {
  return reportUsageError(client, AGENT_REASON.INVALID_ARGUMENTS, message);
}

export default async function buy(client: Client, argv: string[]) {
  const telemetry = new DomainsBuyTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(buySubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: error instanceof Error ? error.message : String(error),
        },
        2
      );
    }
    printError(error);
    return 2;
  }
  const { args, flags } = parsedArgs;

  const [domainName] = args;
  telemetry.trackCliArgumentDomain(domainName);
  telemetry.trackCliOptionAmount(flags['--amount']);
  telemetry.trackCliFlagUseBillingDetails(flags['--use-billing-details']);
  telemetry.trackCliOptionFirstName(flags['--first-name']);
  telemetry.trackCliOptionLastName(flags['--last-name']);
  telemetry.trackCliOptionEmail(flags['--email']);
  telemetry.trackCliOptionPhone(flags['--phone']);
  telemetry.trackCliOptionAddress(flags['--address']);
  telemetry.trackCliOptionCity(flags['--city']);
  telemetry.trackCliOptionState(flags['--state']);
  telemetry.trackCliOptionZip(flags['--zip']);
  telemetry.trackCliOptionCountry(flags['--country']);
  telemetry.trackCliOptionCompany(flags['--company']);
  telemetry.trackCliFlagAutoRenew(flags['--auto-renew']);
  telemetry.trackCliFlagNoAutoRenew(flags['--no-auto-renew']);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);

  if (!domainName) {
    if (client.nonInteractive) {
      const globalFlags = getGlobalFlagsFromArgs(client.argv.slice(2));
      const cmd = getCommandNamePlain(
        `domains buy <domain> ${globalFlags.join(' ')}`.trim()
      );
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'missing_arguments',
          message: `Missing domain name. Run: ${cmd}`,
          next: [
            {
              command: cmd,
              when: 'Replace <domain> with the domain to buy',
            },
          ],
        },
        2
      );
    }
    output.error(
      `Missing domain name. Run ${getCommandName(`domains --help`)}`
    );
    return 2;
  }

  // An extra argument is never ignored: `--auto-renew false` would otherwise
  // drop `false` and turn auto-renew on. The value isn't echoed, since it can
  // be part of a name or address.
  if (args.length > 1) {
    const extra = args[1].toLowerCase();
    return usageError(
      client,
      extra === 'true' || extra === 'false'
        ? "Unexpected extra argument. On/off options like --auto-renew don't take a value: pass --auto-renew or --no-auto-renew."
        : 'Unexpected extra argument. domains buy takes one domain; quote option values that contain spaces, like --address "1 Main St".'
    );
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    return usageError(client, formatResult.error);
  }
  const asJson = formatResult.jsonOutput;

  const { domain: rootDomain, subdomain } = parse(domainName);
  if (subdomain || !rootDomain) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_domain',
          message: `Invalid domain name '${domainName}'. Use a registrable root domain (no subdomain).`,
        },
        1
      );
    }
    output.error(
      `Invalid domain name "${domainName}". Run ${getCommandName(
        `domains --help`
      )}`
    );
    return 1;
  }

  const amount = parseAmount(flags['--amount']);
  if (amount instanceof Error) {
    return usageError(client, amount.message);
  }
  const fromFlags = readContactFlags(flags);
  if (typeof fromFlags === 'string') {
    return usageError(client, fromFlags);
  }
  const valuedFlag = chargeFlagWithValue(argv, [
    '--auto-renew',
    '--no-auto-renew',
    '--use-billing-details',
  ]);
  if (valuedFlag) {
    return usageError(client, valuedFlag);
  }
  const useBilling = Boolean(flags['--use-billing-details']);
  if (flags['--auto-renew'] && flags['--no-auto-renew']) {
    return usageError(client, "Can't use --auto-renew with --no-auto-renew.");
  }
  // Auto-renew starts a recurring charge, so it has no default without a
  // terminal: the command has to say --auto-renew or --no-auto-renew.
  const autoRenewChoice: boolean | undefined = flags['--auto-renew']
    ? true
    : flags['--no-auto-renew']
      ? false
      : undefined;

  const { contextName, team } = await getScope(client);

  const availableStamp = stamp();
  const [domainPrice, domainStatus] = await Promise.all([
    getDomainPrice(client, domainName),
    getDomainStatus(client, domainName),
  ]);

  if (domainPrice instanceof Error) {
    return reportChargeFailure(client, asJson, {
      reason: chargeFailureReason(domainPrice),
      message: domainPrice.message,
    });
  }

  if (!domainStatus.available) {
    return reportChargeFailure(client, asJson, {
      reason: AGENT_REASON.DOMAIN_NOT_AVAILABLE,
      message: `The domain ${domainName} is unavailable.`,
    });
  }

  const { years, purchasePrice, renewalPrice } = domainPrice;

  if (purchasePrice === null || renewalPrice === null) {
    return reportChargeFailure(client, asJson, {
      reason: AGENT_REASON.API_ERROR,
      message: `The price of ${domainName} was not found.`,
    });
  }

  output.log(
    `The domain ${param(domainName)} is ${chalk.underline(
      'available'
    )} to buy under ${chalk.bold(contextName)}! ${availableStamp()}`
  );

  const billing = getBillingContact(team);
  const contact = mergeContact(fromFlags, useBilling ? billing : {});
  const commandOptions = {
    team: team?.slug,
    useBilling,
    contact: fromFlags,
    autoRenew: autoRenewChoice,
    json: asJson,
  };

  if (amount !== undefined && !amountMatchesPrice(amount, purchasePrice)) {
    return reportPriceChanged(client, {
      verb: 'buy',
      domain: domainName,
      amount,
      price: purchasePrice,
      nextCommand: buildBuyCommand(client, domainName, {
        ...commandOptions,
        amount: purchasePrice,
        missing: missingContactFields(contact),
      }),
      json: asJson,
    });
  }

  let autoRenew: boolean;
  let contactInformation: ContactInformation;

  if (!canPromptForCharge(client, asJson)) {
    const missing = missingContactFields(contact);
    if (
      amount === undefined ||
      missing.length > 0 ||
      autoRenewChoice === undefined
    ) {
      return requireApproval(client, {
        domain: domainName,
        team: team?.slug,
        contextName,
        price: purchasePrice,
        renewalPrice,
        years,
        amount,
        fromFlags,
        billing,
        useBilling,
        autoRenew: autoRenewChoice,
        json: asJson,
      });
    }
    // The person running the command has to name the team that pays.
    if (team) {
      const refused = refuseUnnamedTeam(client, asJson, {
        verb: 'buy',
        domain: domainName,
        team,
        nextCommand: buildBuyCommand(client, domainName, {
          ...commandOptions,
          amount,
          missing: [],
        }),
      });
      if (refused !== undefined) return refused;
    }
    autoRenew = autoRenewChoice;
    contactInformation = {
      ...(contact as ContactInformation),
      // `--company ''` means no company.
      companyName: contact.companyName || undefined,
    };
  } else {
    // A matching --amount is consent to the price, not to the recurring
    // charge, so auto-renew is still asked unless --no-auto-renew turned it off.
    if (
      amount === undefined &&
      !(await client.input.confirm(
        `Buy now for ${chalk.bold(formatUsd(purchasePrice))} (${formatTerm(years)})?`,
        false
      ))
    ) {
      return 0;
    }
    autoRenew =
      autoRenewChoice ??
      (await client.input.confirm(
        years === 1
          ? `Auto renew yearly for ${chalk.bold(formatUsd(renewalPrice))}?`
          : `Auto renew every ${years} years for ${chalk.bold(
              formatUsd(renewalPrice)
            )}?`,
        true
      ));
    contactInformation = await collectContactInformation(client, {
      provided: contact,
      defaults: mergeContact(fromFlags, billing),
    });
  }

  const inspectCommand = buildCommandWithGlobalFlags(
    client.argv,
    `domains inspect ${domainName}`
  );
  let buyResult;
  const purchaseStamp = stamp();
  output.spinner('Purchasing');

  try {
    buyResult = await purchaseDomain(
      client,
      domainName,
      purchasePrice,
      years,
      autoRenew,
      contactInformation
    );
  } catch (err: unknown) {
    // `purchaseDomain` only throws when nothing was charged: a 4xx on the
    // order, or a failure before it was sent. A possible charge comes back as
    // DomainChargeOutcomeUnknown instead.
    output.stopSpinner();
    output.debug(`Server response: ${errorToString(err)}`);
    const apiError = ERRORS.isAPIError(err) ? err : undefined;
    return reportChargeFailure(
      client,
      asJson,
      {
        reason: AGENT_REASON.API_ERROR,
        message: apiError
          ? `Couldn't buy ${domainName}. The API returned an error (${apiError.code}). Nothing was charged.`
          : `Couldn't buy ${domainName}. The order wasn't sent, so nothing was charged.`,
      },
      { apiMessage: apiError?.serverMessage }
    );
  }

  output.stopSpinner();

  if (buyResult instanceof ERRORS.DomainPriceChanged) {
    return reportPriceChanged(client, {
      verb: 'buy',
      domain: domainName,
      amount: purchasePrice,
      nextCommand: buildBuyCommand(client, domainName, {
        ...commandOptions,
        missing: [],
      }),
      json: asJson,
    });
  }

  // The request failed with a 5xx or a lost connection, or the order didn't
  // finish in time, so the domain may still have been bought.
  if (buyResult instanceof ERRORS.DomainChargeOutcomeUnknown) {
    return reportUnknownOutcome(client, asJson, {
      verb: 'buy',
      domain: domainName,
      inspectCommand,
    });
  }

  // Every other result is a failure whose class already has the message.
  if (buyResult instanceof Error) {
    return reportChargeFailure(client, asJson, {
      reason: chargeFailureReason(buyResult),
      message: buyResult.message,
    });
  }

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          status: AGENT_STATUS.OK,
          domain: domainName,
          years,
          charge: { amount: purchasePrice, currency: 'USD' },
          orderId: buyResult.orderId,
          autoRenew,
          renewalPrice,
          message: `Domain ${domainName} purchased.`,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  // stdout carries the bought domain; everything else is on stderr.
  client.stdout.write(`${domainName}\n`);
  output.success(`Domain ${param(domainName)} purchased ${purchaseStamp()}`);
  output.log(
    `Charged ${formatUsd(purchasePrice)} for ${formatTerm(years)}. Registered to ${contactInformation.firstName} ${contactInformation.lastName} (${contactInformation.email}).`
  );
  output.note(
    `You may now use your domain as an alias to your deployments. Run ${getCommandName(
      `alias --help`
    )}`
  );

  return 0;
}

/**
 * Without a terminal, a purchase needs the price a person approved, an
 * explicit auto-renew choice, and every required registrant field. When any is
 * missing, nothing is charged: this reports the price, the renewal terms, the
 * billing details the team already has, and the exact command (one per
 * auto-renew choice when none was made) to run once a person approves.
 */
function requireApproval(
  client: Client,
  opts: {
    domain: string;
    team?: string;
    contextName: string;
    price: number;
    renewalPrice: number;
    years: number;
    amount?: number;
    fromFlags: PartialContact;
    billing: PartialContact;
    useBilling: boolean;
    autoRenew?: boolean;
    json: boolean;
  }
): number {
  const { domain, price, renewalPrice, years, billing, autoRenew } = opts;
  // Only the billing fields the next command would use.
  const shown = billingFieldsUsed(opts.fromFlags, billing);
  const shownFields = CONTACT_FIELDS.filter(({ field }) => shown[field]);
  const hasBilling = shownFields.length > 0;
  // Suggest the billing details whenever they fill something; a person still
  // has to approve them before the command runs.
  const useBilling = opts.useBilling || hasBilling;
  const missing = missingContactFields(
    mergeContact(opts.fromFlags, useBilling ? billing : {})
  );
  const missingFlags = missing.map(flagFor);

  const missingNow = missingContactFields(
    mergeContact(opts.fromFlags, opts.useBilling ? billing : {})
  );
  const needs = [
    ...(opts.amount === undefined ? ['an approved price (--amount)'] : []),
    ...(autoRenew === undefined
      ? ['an auto-renew choice (--auto-renew or --no-auto-renew)']
      : []),
    ...(missingNow.length > 0 ? ['registrant details'] : []),
  ];
  const headline = `Can't buy ${domain} without ${needs.join(' and ')} in non-interactive mode.`;
  const every = years === 1 ? 'year' : formatTerm(years);
  const renewal =
    autoRenew === undefined
      ? `Auto-renew isn't chosen: --auto-renew renews it every ${every} (currently ${formatUsd(renewalPrice)}), --no-auto-renew lets it expire.`
      : autoRenew
        ? `Then it auto-renews every ${every} (currently ${formatUsd(renewalPrice)}).`
        : 'Auto-renew is off.';
  const priceLine = `Price: ${formatUsd(price)} for ${formatTerm(years)}, charged to ${opts.contextName}. ${renewal}`;
  const stillNeeded =
    missingFlags.length > 0 ? `Still needed: ${missingFlags.join(', ')}.` : '';
  // With no auto-renew choice yet, offer both; the person picks one.
  const next = (autoRenew === undefined ? [true, false] : [autoRenew]).map(
    renews => ({
      command: buildBuyCommand(client, domain, {
        team: opts.team,
        amount: price,
        useBilling,
        contact: opts.fromFlags,
        missing,
        autoRenew: renews,
        json: opts.json,
      }),
      when: `Only after a human approves: charges ${formatUsd(price)} now${
        renews
          ? ` and renews every ${every} (currently ${formatUsd(renewalPrice)})`
          : ', with no renewal'
      }`,
    })
  );

  writeChargeAction(client, opts.json, {
    status: AGENT_STATUS.ACTION_REQUIRED,
    reason:
      opts.amount === undefined || autoRenew === undefined
        ? AGENT_REASON.CONFIRMATION_REQUIRED
        : AGENT_REASON.MISSING_REQUIREMENTS,
    action: AGENT_ACTION.CONFIRMATION_REQUIRED,
    message: [
      headline,
      priceLine,
      hasBilling
        ? `The team's billing info has the registrant ${shownFields.map(({ label }) => label.toLowerCase()).join(', ')} (data.billingDetails). Confirm them with the user; --use-billing-details uses them, and any contact option you pass replaces them.`
        : '',
      stillNeeded,
    ]
      .filter(Boolean)
      .join(' '),
    userActionRequired: true,
    hint: 'Show the user the price, renewal terms, and registrant details, and get their approval before running next[]. Domain registrations are non-refundable.',
    data: {
      domain,
      ...(opts.team && { team: opts.team }),
      amount: price,
      currency: 'USD',
      years,
      autoRenew: autoRenew ?? null,
      renewalAmount: renewalPrice,
      ...(hasBilling && { billingDetails: shown }),
    },
    missing: [
      ...(opts.amount === undefined ? ['--amount'] : []),
      ...(autoRenew === undefined ? ['--auto-renew|--no-auto-renew'] : []),
      ...(useBilling && !opts.useBilling ? ['--use-billing-details'] : []),
      ...missingFlags,
    ],
    next,
  });

  const billingRows = hasBilling
    ? [
        `From ${opts.contextName}'s billing info:`,
        ...shownFields.map(
          ({ field, label }) =>
            `  ${label.padEnd(10)}${stripAnsi(shown[field] as string)}`
        ),
      ]
    : [];
  printChargeRecovery(
    [headline, priceLine, ...billingRows, stillNeeded]
      .filter(Boolean)
      .join('\n'),
    next.length > 1
      ? 'Once a person approves the price, details, and auto-renew choice, run one of'
      : 'Once a person approves the price and details, run',
    next.map(({ command }) => command).join('\n')
  );
  return 1;
}
