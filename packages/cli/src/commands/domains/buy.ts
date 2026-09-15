import chalk from 'chalk';
import { errorToString } from '@vercel/error-utils';
import * as ERRORS from '../../util/errors-ts';
import param from '../../util/output/param';
import purchaseDomain from '../../util/domains/purchase-domain';
import stamp from '../../util/output/stamp';
import { getCommandName, packageName } from '../../util/pkg-name';
import output from '../../output-manager';
import { DomainsBuyTelemetryClient } from '../../util/telemetry/commands/domains/buy';
import type Client from '../../util/client';
import { buySubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { validateJsonOutput } from '../../util/output-format';
import collectContactInformation, {
  CONTACT_FIELDS,
  normalizeContactInformation,
  validateContactInformation,
  type ContactInformation,
} from '../../util/domains/collect-contact-information';
import {
  buildCommandWithGlobalFlags,
  openUrlInBrowserCommand,
  shouldEmitNonInteractiveCommandError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { getTeamBillingUrl } from '../../util/billing-url';
import {
  acquirePurchaseFacts,
  type PurchaseAcquisitionError,
  type PurchaseFacts,
} from './buy-acquisition';
import {
  describePurchaseFailure,
  planPurchase,
  type BuyCommandPrefill,
  type PurchaseCommands,
  type PurchaseFailureKind,
  type PurchaseIntent,
} from './buy-plan';
import { renderNextSteps, renderOrderSummary } from './buy-human-output';
import {
  renderStructuredBuyError,
  renderStructuredPlan,
  type StructuredBuyError,
} from './buy-structured-output';

const VERCEL_DOMAINS_URL = 'https://vercel.com/dashboard/domains';
const VERCEL_ACCOUNT_BILLING_URL = 'https://vercel.com/account/billing';

type BuyOutputMode = 'human' | 'json' | 'non-interactive';

interface BuyOptions {
  domainName: string;
  intent: PurchaseIntent;
  outputMode: BuyOutputMode;
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
    return writeCommandError(client, getOutputMode(client, false), {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: errorMessage(error),
      next: [
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            'domains buy --help'
          ),
          when: 'See valid arguments and flags',
        },
      ],
    });
  }

  const { args, flags } = parsedArgs;
  const [domainName] = args;

  telemetry.trackCliArgumentDomain(domainName);
  telemetry.trackCliOptionYears(flags['--years']);
  telemetry.trackCliFlagAutoRenew(flags['--auto-renew']);
  telemetry.trackCliFlagNoAutoRenew(flags['--no-auto-renew']);
  telemetry.trackCliOptionExpectedPrice(flags['--expected-price']);
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
  telemetry.trackCliOptionFormat(flags['--format']);

  if (!domainName) {
    return writeCommandError(client, getOutputMode(client, false), {
      reason: AGENT_REASON.MISSING_ARGUMENTS,
      message: 'A domain is required.',
      next: [
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            'domains buy <domain>'
          ),
          when: 'Replace <domain> with the domain to buy',
        },
      ],
      humanMessage: `Missing domain name. Run ${getCommandName(
        'domains --help'
      )}`,
    });
  }

  if (args.length > 1) {
    return writeCommandError(client, getOutputMode(client, false), {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: `Only one domain can be purchased at a time; got ${args.length}.`,
      next: [
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            `domains buy ${shellQuoteCommandArg(domainName)}`
          ),
          when: 'Retry with a single domain',
        },
      ],
      humanMessage: `Only one domain can be purchased at a time. Run ${getCommandName(
        `domains buy ${domainName}`
      )}`,
    });
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    return writeCommandError(client, getOutputMode(client, false), {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: formatResult.error,
      next: [
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            `domains buy ${shellQuoteCommandArg(domainName)} --format=json`
          ),
          when: 'Retry with the supported JSON format',
        },
      ],
    });
  }

  const outputMode = getOutputMode(client, formatResult.jsonOutput);

  const intentResult = buildPurchaseIntent(flags);
  if (!intentResult.ok) {
    return writeCommandError(client, outputMode, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: intentResult.problems.join(' '),
    });
  }

  const options: BuyOptions = {
    domainName,
    intent: intentResult.intent,
    outputMode,
  };

  try {
    return await run(client, options);
  } catch (error) {
    output.stopSpinner();
    if (isStructuredOutput(outputMode)) {
      return writeCommandError(client, outputMode, {
        reason: AGENT_REASON.API_ERROR,
        message: errorMessage(error),
      });
    }
    output.prettyError(error);
    return 1;
  }
}

async function run(client: Client, options: BuyOptions): Promise<number> {
  const { domainName, intent, outputMode } = options;
  const availableStamp = stamp();
  if (outputMode === 'human') {
    output.spinner(`Checking availability for ${domainName}`);
  }

  const acquisition = await acquirePurchaseFacts(client, domainName);
  output.stopSpinner();

  if (!acquisition.ok) {
    return writeCommandError(
      client,
      outputMode,
      commandErrorForAcquisition(client, domainName, acquisition.error)
    );
  }

  const facts = acquisition.facts;
  const commands = buildPurchaseCommands(client, facts);
  const plan = planPurchase(facts, intent, commands);

  // Structured modes prepare the purchase but never perform it: the purchase
  // POST is only reachable through the interactive flow below.
  if (isStructuredOutput(outputMode)) {
    client.stdout.write(renderStructuredPlan(plan));
    return plan.exitCode;
  }

  if (!plan.ok) {
    output.error(plan.message);
    if (plan.hint) {
      output.log(plan.hint);
    }
    const steps = renderNextSteps(plan.next);
    if (steps) {
      output.print(steps);
    }
    return 1;
  }

  output.log(
    `The domain ${param(domainName)} is ${chalk.underline(
      'available'
    )} to buy under ${chalk.bold(facts.contextName)}! ${availableStamp()}`
  );

  const autoRenew =
    intent.autoRenew ??
    (await client.input.confirm(
      facts.years === 1
        ? `Auto renew yearly for ${chalk.bold(`$${plan.order.renewalPrice}`)}?`
        : `Auto renew every ${facts.years} years for ${chalk.bold(
            `$${plan.order.renewalPrice}`
          )}?`,
      true
    ));

  const contactInformation = await collectContactInformation(
    client,
    intent.contact
  );

  output.print(
    renderOrderSummary({ ...plan.order, autoRenew }, contactInformation)
  );

  if (
    !(await client.input.confirm(
      `Buy ${param(domainName)} for ${chalk.bold(
        `$${plan.order.purchasePrice}`
      )}?`,
      false
    ))
  ) {
    return 0;
  }

  let buyResult;
  const purchaseStamp = stamp();
  output.spinner('Purchasing');

  try {
    buyResult = await purchaseDomain(
      client,
      domainName,
      plan.order.purchasePrice,
      plan.order.years,
      autoRenew,
      contactInformation
    );
  } catch (err: unknown) {
    output.stopSpinner();
    output.error(
      'An unexpected error occurred while purchasing your domain. Please try again later.'
    );
    output.debug(`Server response: ${errorToString(err)}`);
    return 1;
  }

  output.stopSpinner();

  if (buyResult instanceof Error) {
    const failure = describePurchaseFailure(
      domainName,
      purchaseFailureKind(buyResult),
      commands
    );
    output.error(failure.message);
    if (failure.hint) {
      output.log(failure.hint);
    }
    const steps = renderNextSteps(failure.next);
    if (steps) {
      output.print(steps);
    }
    return 1;
  }

  output.success(`Domain ${param(domainName)} purchased ${purchaseStamp()}`);
  output.log(
    `Run ${getCommandName(
      `domains verify ${domainName}`
    )} to check its DNS configuration, or ${getCommandName(
      `domains inspect ${domainName}`
    )} to view its details.`
  );
  output.note(
    `You may now use your domain as an alias to your deployments. Run ${getCommandName(
      `alias --help`
    )}`
  );

  return 0;
}

function getOutputMode(client: Client, jsonOutput: boolean): BuyOutputMode {
  if (jsonOutput) {
    return 'json';
  }
  // CI runs cannot answer the confirmation either, so they get the same
  // structured "prepared, human must confirm" payload as agents.
  if (shouldEmitNonInteractiveCommandError(client) || process.env.CI) {
    return 'non-interactive';
  }
  return 'human';
}

function isStructuredOutput(mode: BuyOutputMode): boolean {
  return mode !== 'human';
}

interface BuyFlags {
  '--years'?: number;
  '--auto-renew'?: boolean;
  '--no-auto-renew'?: boolean;
  '--expected-price'?: number;
  [key: string]: unknown;
}

type PurchaseIntentResult =
  | { ok: true; intent: PurchaseIntent }
  | { ok: false; problems: string[] };

function buildPurchaseIntent(flags: BuyFlags): PurchaseIntentResult {
  const problems: string[] = [];

  if (flags['--auto-renew'] && flags['--no-auto-renew']) {
    problems.push('Use either --auto-renew or --no-auto-renew, not both.');
  }
  const autoRenew = flags['--auto-renew']
    ? true
    : flags['--no-auto-renew']
      ? false
      : undefined;

  const years = flags['--years'];
  if (years !== undefined && (!Number.isInteger(years) || years < 1)) {
    problems.push('Invalid --years: must be a positive integer.');
  }

  const expectedPrice = flags['--expected-price'];
  if (
    expectedPrice !== undefined &&
    (!Number.isFinite(expectedPrice) || expectedPrice <= 0)
  ) {
    problems.push('Invalid --expected-price: must be a positive number.');
  }

  const contact: Partial<ContactInformation> = {};
  for (const field of CONTACT_FIELDS) {
    const value = flags[field.flag];
    if (typeof value === 'string') {
      contact[field.key] = value;
    }
  }
  problems.push(...validateContactInformation(contact));

  if (problems.length) {
    return { ok: false, problems };
  }
  return {
    ok: true,
    intent: {
      years,
      autoRenew,
      expectedPrice,
      contact: normalizeContactInformation(contact),
    },
  };
}

function buildPurchaseCommands(
  client: Client,
  facts: PurchaseFacts
): PurchaseCommands {
  const domainArg = shellQuoteCommandArg(facts.domainName);
  return {
    buy: prefillArgs => buildBuyCommand(client, facts.domainName, prefillArgs),
    search: buildCommandWithGlobalFlags(
      client.argv,
      `domains search ${domainArg}`
    ),
    price: buildCommandWithGlobalFlags(
      client.argv,
      `domains price ${domainArg}`
    ),
    transferIn: buildCommandWithGlobalFlags(
      client.argv,
      `domains transfer-in ${domainArg}`
    ),
    openDashboard: openUrlInBrowserCommand(VERCEL_DOMAINS_URL),
    openBilling: openUrlInBrowserCommand(
      facts.teamSlug
        ? getTeamBillingUrl(facts.teamSlug)
        : VERCEL_ACCOUNT_BILLING_URL
    ),
  };
}

/**
 * Builds the fully-prefilled interactive command handed to the user. Strips
 * --non-interactive and --yes: the command exists precisely so a human can
 * run it and give explicit consent.
 */
function buildBuyCommand(
  client: Client,
  domainName: string,
  prefillArgs: BuyCommandPrefill
): string {
  const parts = ['domains', 'buy', shellQuoteCommandArg(domainName)];
  parts.push('--years', String(prefillArgs.years));
  if (prefillArgs.autoRenew === true) {
    parts.push('--auto-renew');
  } else if (prefillArgs.autoRenew === false) {
    parts.push('--no-auto-renew');
  }
  parts.push('--expected-price', String(prefillArgs.expectedPrice));
  for (const field of CONTACT_FIELDS) {
    const value = prefillArgs.contact[field.key];
    if (value) {
      parts.push(field.flag, shellQuoteCommandArg(value));
    }
  }
  return buildCommandWithGlobalFlags(
    client.argv,
    parts.join(' '),
    packageName,
    { excludeFlags: ['--non-interactive', '--yes'] }
  );
}

function purchaseFailureKind(error: Error): PurchaseFailureKind {
  if (error instanceof ERRORS.DomainPaymentError) {
    return 'payment-failed';
  }
  if (error instanceof ERRORS.DomainRegistrationContactInfoRequired) {
    return 'contact-info-required';
  }
  if (
    error instanceof ERRORS.UnsupportedTLD ||
    error instanceof ERRORS.TLDNotSupportedViaCLI
  ) {
    return 'tld-not-supported';
  }
  if (error instanceof ERRORS.InvalidDomain) {
    return 'invalid-domain';
  }
  if (error instanceof ERRORS.DomainNotAvailable) {
    return 'not-available';
  }
  return 'unexpected';
}

function commandErrorForAcquisition(
  client: Client,
  domainName: string,
  error: PurchaseAcquisitionError
): CommandError {
  const domainArg = shellQuoteCommandArg(domainName);
  if (error.kind === 'invalid-domain') {
    return {
      reason: AGENT_REASON.INVALID_DOMAIN,
      message: error.message,
      next: [
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            'domains buy <domain>'
          ),
          when: 'Replace <domain> with a registrable root domain',
        },
      ],
      humanMessage: `Invalid domain name "${domainName}". Run ${getCommandName(
        'domains --help'
      )}`,
    };
  }
  if (error.kind === 'tld-not-supported') {
    return {
      reason: AGENT_REASON.TLD_NOT_SUPPORTED,
      message: error.message,
      next: [
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            `domains search ${domainArg}`
          ),
          when: 'Find candidates with a supported TLD',
        },
      ],
    };
  }
  return {
    reason: AGENT_REASON.API_ERROR,
    message: error.message,
    next: [
      {
        command: buildCommandWithGlobalFlags(
          client.argv,
          `domains buy ${domainArg}`
        ),
        when: 'Retry the availability and price check',
      },
    ],
  };
}

interface CommandError extends StructuredBuyError {
  humanMessage?: string;
}

function writeCommandError(
  client: Client,
  outputMode: BuyOutputMode,
  error: CommandError
): number {
  output.stopSpinner();
  if (isStructuredOutput(outputMode)) {
    client.stdout.write(
      renderStructuredBuyError({
        reason: error.reason,
        message: error.message,
        hint: error.hint,
        userActionRequired: error.userActionRequired,
        next: error.next,
      })
    );
  } else {
    output.error(error.humanMessage ?? error.message);
  }
  return 1;
}

/**
 * Quotes a value for a command a human will paste into an interactive shell.
 * Single quotes (with `'\''` for embedded quotes) so history expansion (`!`)
 * and `$`/backtick interpolation can never fire, unlike double quoting.
 */
function shellQuoteCommandArg(value: string): string {
  if (/^[a-zA-Z0-9_./:@%+,=-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
