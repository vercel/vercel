import { getPlatformEnv } from '@vercel/build-utils';
import type Client from '../client';
import { canPrompt } from '../can-prompt';
import output from '../../output-manager';
import { formatUsd } from '../budget/api';
import { scopeFlagPassed } from '../get-scope';
import {
  outputActionRequired,
  outputAgentError,
  type ActionRequiredPayload,
  type AgentErrorPayload,
} from '../agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
  getExitCodeForReason,
} from '../agent-output-constants';

const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

const REASON_BY_CODE: Record<string, string> = {
  UNSUPPORTED_TLD: AGENT_REASON.TLD_NOT_SUPPORTED,
  UNSUPPORTED_TLD_VIA_CLI: AGENT_REASON.TLD_NOT_SUPPORTED,
  INVALID_DOMAIN: AGENT_REASON.INVALID_DOMAIN,
  DOMAIN_NOT_AVAILABLE: AGENT_REASON.DOMAIN_NOT_AVAILABLE,
  DOMAIN_PAYMENT_ERROR: AGENT_REASON.PAYMENT_FAILED,
};

/** The agent `reason` for a domain error class; `api_error` otherwise. */
export function chargeFailureReason(err: Error): string {
  const code = (err as { code?: unknown }).code;
  return (
    (typeof code === 'string' && REASON_BY_CODE[code]) || AGENT_REASON.API_ERROR
  );
}

/** Parses `--amount <USD>`; `undefined` when it's absent. */
export function parseAmount(
  raw: string | undefined
): number | undefined | Error {
  if (raw === undefined) {
    return undefined;
  }
  const value = raw.trim();
  if (!AMOUNT_PATTERN.test(value) || Number(value) <= 0) {
    return new Error(
      `Invalid --amount "${raw}". Use the price in USD, such as 20.00.`
    );
  }
  return Number(value);
}

/** Compares to the cent, so `20`, `20.0`, and `20.00` all match a $20 price. */
export function amountMatchesPrice(amount: number, price: number): boolean {
  return Math.round(amount * 100) === Math.round(price * 100);
}

export function formatAmountArg(price: number): string {
  return price.toFixed(2);
}

export function formatTerm(years: number): string {
  return `${years} ${years === 1 ? 'year' : 'years'}`;
}

/**
 * Whether a domain charge may prompt. The shared mode detection doesn't treat
 * CI or `--json` as non-interactive yet, so a CI job or a JSON caller with a
 * terminal would wait on a prompt; a charge never prompts for either.
 */
export function canPromptForCharge(client: Client, json: boolean): boolean {
  return canPrompt(client) && !process.env.CI && !json;
}

/**
 * The flag parser reads `--auto-renew=false` as true, so a Boolean option that
 * decides a charge must not take a value. Returns the usage error, if any.
 */
export function chargeFlagWithValue(
  argv: string[],
  flags: string[]
): string | undefined {
  for (const arg of argv) {
    if (arg === '--') break;
    const name = arg.split('=')[0];
    if (arg.includes('=') && flags.includes(name)) {
      return `${name} doesn't take a value. Pass it on its own, or leave it out${
        name === '--auto-renew' ? ' and pass --no-auto-renew' : ''
      }.`;
    }
  }
  return undefined;
}

/**
 * Whether a charge without a terminal names the team it charges, from a
 * source the person running it controls: `--scope`/`--team` on the command,
 * or `VERCEL_ORG_ID` set to that team. `vercel.json` `scope` doesn't count,
 * because any contributor can change it. `VERCEL_ORG_ID` naming a different
 * team is a conflict: nothing is charged.
 */
export function chargeTeamStatus(
  client: Client,
  teamId: string
): 'named' | 'unnamed' | 'conflict' {
  const orgId = getPlatformEnv('ORG_ID');
  if (orgId && orgId !== teamId) return 'conflict';
  return scopeFlagPassed(client.argv) || orgId === teamId ? 'named' : 'unnamed';
}

export function printChargeRecovery(
  headline: string,
  instruction: string,
  command: string
) {
  output.fatal(`${headline}\n\n${instruction}:\n  ${command}`);
}

/**
 * Writes an `action_required` payload: as the agent error document in
 * non-interactive mode (which exits), or on stdout for a `--json` run.
 */
export function writeChargeAction(
  client: Client,
  json: boolean,
  payload: ActionRequiredPayload
) {
  outputActionRequired(client, payload, 1);
  if (json) {
    client.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  }
}

/**
 * Reports a bad option value before anything is sent: the agent error
 * document in non-interactive mode, the message on stderr.
 */
export function reportUsageError(
  client: Client,
  reason: string,
  message: string
): number {
  const exitCode = getExitCodeForReason(reason);
  outputAgentError(client, { status: 'error', reason, message }, exitCode);
  output.error(message);
  return exitCode;
}

/**
 * Reports a failed or unconfirmed charge. In non-interactive mode the error
 * document is the whole report (`outputAgentError` exits). Otherwise the
 * message goes to stderr, and a `--json` run also gets the document on stdout.
 * `apiMessage` is the API's own explanation: a detail line on stderr and
 * `data.apiMessage` in JSON, never part of the message. `recovery` prints the
 * command to run next under the message.
 */
export function reportChargeFailure(
  client: Client,
  json: boolean,
  payload: Omit<AgentErrorPayload, 'status'>,
  opts: {
    apiMessage?: string;
    recovery?: { instruction: string; command: string };
  } = {}
): number {
  const document: AgentErrorPayload = {
    status: 'error',
    ...payload,
    ...(opts.apiMessage && {
      data: { ...payload.data, apiMessage: opts.apiMessage },
    }),
  };
  outputAgentError(client, document, 1);
  if (json) {
    client.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
  }
  const headline = opts.apiMessage
    ? `${payload.message}\n${opts.apiMessage}`
    : payload.message;
  if (opts.recovery) {
    printChargeRecovery(
      headline,
      opts.recovery.instruction,
      opts.recovery.command
    );
  } else {
    output.fatal(headline);
  }
  return 1;
}

/**
 * Reports that a charge may or may not have gone through. Running the command
 * again could charge twice, so the next step is to inspect the domain.
 */
export function reportUnknownOutcome(
  client: Client,
  json: boolean,
  opts: { verb: 'buy' | 'renew'; domain: string; inspectCommand: string }
): number {
  const done = opts.verb === 'buy' ? 'was bought' : 'was renewed';
  const action = opts.verb === 'buy' ? 'purchase' : 'renewal';
  return reportChargeFailure(
    client,
    json,
    {
      reason: AGENT_REASON.UNKNOWN_OUTCOME,
      message: `Can't confirm whether ${opts.domain} ${done}. Check the domain before running ${opts.verb} again, or you may be charged twice.`,
      next: [
        {
          command: opts.inspectCommand,
          when: `Check whether the ${action} went through before retrying`,
        },
      ],
    },
    {
      recovery: {
        instruction: `Check whether the ${action} went through`,
        command: opts.inspectCommand,
      },
    }
  );
}

/**
 * Without a terminal, a charge needs the team it charges named by the person
 * running it (see `chargeTeamStatus`). Returns an exit code when it refuses,
 * having charged nothing; `undefined` when the charge may go ahead.
 */
export function refuseUnnamedTeam(
  client: Client,
  json: boolean,
  opts: {
    verb: 'buy' | 'renew';
    domain: string;
    team: { id: string; slug: string };
    nextCommand: string;
  }
): number | undefined {
  const { verb, domain, team } = opts;
  const status = chargeTeamStatus(client, team.id);
  if (status === 'named') return undefined;

  if (status === 'conflict') {
    return reportChargeFailure(client, json, {
      reason: AGENT_REASON.CONFLICT,
      message: `Can't ${verb} ${domain}. VERCEL_ORG_ID names a different team than ${team.slug}, the team this run would charge. Nothing was charged.`,
      userActionRequired: true,
      hint: 'Set VERCEL_ORG_ID to the team to charge, or unset it and pass --scope with that team.',
      data: { domain, team: team.slug },
    });
  }

  const message = `Can't ${verb} ${domain} without naming the team to charge in non-interactive mode. It would charge ${team.slug}. Nothing was charged.`;
  writeChargeAction(client, json, {
    status: AGENT_STATUS.ACTION_REQUIRED,
    reason: AGENT_REASON.MISSING_SCOPE,
    action: AGENT_ACTION.CONFIRMATION_REQUIRED,
    message,
    userActionRequired: true,
    data: { domain, team: team.slug },
    missing: ['--scope'],
    next: [
      {
        command: opts.nextCommand,
        when: `Only after a human approves charging ${team.slug}`,
      },
    ],
  });
  printChargeRecovery(
    message,
    'Once a person approves the team to charge, run',
    opts.nextCommand
  );
  return 1;
}

/**
 * Reports that the approved `--amount` doesn't match the domain's price.
 * Nothing is charged. With a known current price, the next command carries
 * it, and a person has to approve it before anyone runs it. Without one (the
 * API rejected the price at checkout), the next command asks for a new quote.
 */
export function reportPriceChanged(
  client: Client,
  opts: {
    verb: 'buy' | 'renew';
    domain: string;
    amount: number;
    price?: number;
    nextCommand: string;
    json: boolean;
  }
): number {
  const { verb, domain, amount, price, nextCommand } = opts;
  return reportChargeFailure(
    client,
    opts.json,
    {
      reason: AGENT_REASON.PRICE_CHANGED,
      message:
        price === undefined
          ? `Can't ${verb} ${domain}. Its price changed from ${formatUsd(amount)}. Nothing was charged.`
          : `Can't ${verb} ${domain}. Its price is ${formatUsd(price)}, not ${formatUsd(amount)}. Nothing was charged.`,
      userActionRequired: true,
      data:
        price === undefined
          ? { domain }
          : { domain, amount: price, currency: 'USD' },
      next: [
        {
          command: nextCommand,
          when:
            price === undefined
              ? 'Get the current price, then ask a human to approve it'
              : `Only after a human approves the price of ${formatUsd(price)}`,
        },
      ],
    },
    {
      recovery: {
        instruction:
          price === undefined
            ? 'Get the current price'
            : 'Once a person approves the price, run',
        command: nextCommand,
      },
    }
  );
}
