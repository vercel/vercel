import { AGENT_ACTION, AGENT_REASON } from '../../util/agent-output-constants';
import {
  CONTACT_FIELDS,
  type ContactInformation,
} from '../../util/domains/collect-contact-information';
import type { PurchaseFacts } from './buy-acquisition';

export interface NextStep {
  command: string;
  when?: string;
}

/**
 * What the caller asked for via flags. `autoRenew === undefined` means the
 * flag was not provided (interactive mode prompts; the prefilled command
 * omits it so the user is asked).
 */
export interface PurchaseIntent {
  years?: number;
  autoRenew?: boolean;
  expectedPrice?: number;
  contact: Partial<ContactInformation>;
}

/** Prefill for the interactive command handed to the user in next[]. */
export interface BuyCommandPrefill {
  years: number;
  autoRenew: boolean | undefined;
  expectedPrice: number;
  contact: Partial<ContactInformation>;
}

/**
 * Command strings/builders injected by the caller so the plan stays pure.
 * All commands must be plain (no ANSI) and shell-safe.
 */
export interface PurchaseCommands {
  buy(prefill: BuyCommandPrefill): string;
  search: string;
  price: string;
  transferIn: string;
  openDashboard: string;
  openBilling: string;
}

export interface PurchaseOrder {
  domain: string;
  contextName: string;
  purchasePrice: number;
  renewalPrice: number;
  years: number;
  /** Resolved from flags; undefined when the user must still be asked. */
  autoRenew: boolean | undefined;
}

export type PurchasePlan =
  | {
      ok: true;
      exitCode: 0;
      reason: typeof AGENT_REASON.PURCHASE_REQUIRES_USER;
      action: typeof AGENT_ACTION.CONFIRMATION_REQUIRED;
      message: string;
      hint: string;
      order: PurchaseOrder;
      /** Flags for required registrant fields the agent still needs to collect. */
      missingContactFlags: string[];
      next: NextStep[];
    }
  | {
      ok: false;
      exitCode: 1;
      reason: string;
      message: string;
      hint?: string;
      next: NextStep[];
    };

/**
 * Pure function: facts + flags → purchase plan. Decides whether the domain is
 * buyable, whether the caller's expectations still hold, and what to do next.
 * Never performs the purchase — that is reserved for the interactive flow.
 */
export function planPurchase(
  facts: PurchaseFacts,
  intent: PurchaseIntent,
  commands: PurchaseCommands
): PurchasePlan {
  if (!facts.available) {
    return {
      ok: false,
      exitCode: 1,
      reason: AGENT_REASON.DOMAIN_NOT_AVAILABLE,
      message: `The domain ${facts.domainName} is not available to buy.`,
      hint: 'Search for available alternatives, or transfer the domain in if the user already owns it.',
      next: [
        { command: commands.search, when: 'Find available domain candidates' },
        {
          command: commands.transferIn,
          when: 'Transfer the domain in if the user already owns it',
        },
      ],
    };
  }

  if (facts.purchasePrice === null || facts.renewalPrice === null) {
    return {
      ok: false,
      exitCode: 1,
      reason: AGENT_REASON.API_ERROR,
      message: `No purchase price is available for ${facts.domainName}.`,
      next: [
        { command: commands.price, when: 'Retry the registrar price quote' },
      ],
    };
  }

  if (intent.years !== undefined && intent.years !== facts.years) {
    return {
      ok: false,
      exitCode: 1,
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: `${facts.domainName} is quoted for a ${facts.years}-year term; --years ${intent.years} is not available.`,
      next: [
        {
          command: commands.buy(prefill(facts, intent)),
          when: `Retry with the quoted ${facts.years}-year term`,
        },
      ],
    };
  }

  if (
    intent.expectedPrice !== undefined &&
    intent.expectedPrice !== facts.purchasePrice
  ) {
    return {
      ok: false,
      exitCode: 1,
      reason: AGENT_REASON.PRICE_CHANGED,
      message: `The purchase price for ${facts.domainName} is now $${facts.purchasePrice}, not $${intent.expectedPrice}.`,
      hint: 'Confirm the new price with the user before retrying with the updated --expected-price.',
      next: [
        {
          command: commands.buy(prefill(facts, intent)),
          when: 'User accepts the new price and confirms the purchase interactively',
        },
      ],
    };
  }

  const missingContactFlags = CONTACT_FIELDS.filter(
    field => field.required && !intent.contact[field.key]
  ).map(field => field.flag);
  const term = formatTerm(facts.years);

  return {
    ok: true,
    exitCode: 0,
    reason: AGENT_REASON.PURCHASE_REQUIRES_USER,
    action: AGENT_ACTION.CONFIRMATION_REQUIRED,
    message: `${facts.domainName} is available to buy under ${facts.contextName} for $${facts.purchasePrice} (${term}, renews at $${facts.renewalPrice}). A human must run the purchase interactively; agents must not buy domains on behalf of a user.`,
    hint: missingContactFlags.length
      ? 'Collect the missing registrant contact details from the user, add them as flags, then hand the user the prefilled command in next[] to run interactively.'
      : 'All purchase details are prefilled. Hand the user the command in next[]; the CLI asks for final confirmation before buying.',
    order: {
      domain: facts.domainName,
      contextName: facts.contextName,
      purchasePrice: facts.purchasePrice,
      renewalPrice: facts.renewalPrice,
      years: facts.years,
      autoRenew: intent.autoRenew,
    },
    missingContactFlags,
    next: [
      {
        command: commands.buy(prefill(facts, intent)),
        when: 'User confirms the purchase interactively',
      },
      {
        command: commands.openDashboard,
        when: 'User prefers to buy in the Vercel dashboard',
      },
    ],
  };
}

function prefill(facts: PurchaseFacts, intent: PurchaseIntent) {
  return {
    years: facts.years,
    autoRenew: intent.autoRenew,
    expectedPrice: facts.purchasePrice ?? 0,
    contact: intent.contact,
  };
}

export function formatTerm(years: number): string {
  return `${years}yr${years > 1 ? 's' : ''}`;
}

/** Typed outcomes of an attempted purchase, mapped from API error classes. */
export type PurchaseFailureKind =
  | 'payment-failed'
  | 'contact-info-required'
  | 'tld-not-supported'
  | 'invalid-domain'
  | 'not-available'
  | 'unexpected';

export interface PurchaseFailureDescription {
  reason: string;
  message: string;
  hint?: string;
  next: NextStep[];
}

/**
 * Pure mapping from a purchase failure to reason code, message, and recovery
 * commands — shared by the human renderer so copy never diverges.
 */
export function describePurchaseFailure(
  domainName: string,
  kind: PurchaseFailureKind,
  commands: PurchaseCommands
): PurchaseFailureDescription {
  if (kind === 'payment-failed') {
    return {
      reason: AGENT_REASON.PAYMENT_FAILED,
      message: 'Your card was declined.',
      hint: 'Update the payment method, then retry the purchase.',
      next: [
        {
          command: commands.openBilling,
          when: 'Update the payment method in the dashboard',
        },
      ],
    };
  }
  if (kind === 'contact-info-required') {
    return {
      reason: AGENT_REASON.ADDITIONAL_CONTACT_INFO_REQUIRED,
      message: `Registering ${domainName} requires additional contact information that the CLI cannot collect.`,
      hint: 'Complete the purchase in the Vercel dashboard.',
      next: [
        {
          command: commands.openDashboard,
          when: 'Complete the purchase in the dashboard',
        },
      ],
    };
  }
  if (kind === 'tld-not-supported') {
    return {
      reason: AGENT_REASON.TLD_NOT_SUPPORTED,
      message: `The TLD for ${domainName} is not supported for purchase through Vercel.`,
      next: [
        {
          command: commands.search,
          when: 'Find candidates with a supported TLD',
        },
      ],
    };
  }
  if (kind === 'invalid-domain') {
    return {
      reason: AGENT_REASON.INVALID_DOMAIN,
      message: `The domain ${domainName} is not valid.`,
      next: [],
    };
  }
  if (kind === 'not-available') {
    return {
      reason: AGENT_REASON.DOMAIN_NOT_AVAILABLE,
      message: `The domain ${domainName} is no longer available to buy.`,
      next: [
        { command: commands.search, when: 'Find available domain candidates' },
      ],
    };
  }
  return {
    reason: AGENT_REASON.API_ERROR,
    message:
      'An unexpected error occurred while purchasing the domain. Try again later.',
    next: [],
  };
}
