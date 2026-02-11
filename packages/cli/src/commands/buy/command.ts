import { packageName } from '../../util/pkg-name';

/**
 * Supported credit types for purchase, matching the API's creditTypeSchema:
 *   z.enum(['v0', 'gateway', 'agent'])
 */
export const SUPPORTED_CREDIT_TYPES = ['v0', 'gateway', 'agent'] as const;
export type CreditType = (typeof SUPPORTED_CREDIT_TYPES)[number];

/** Human-readable labels for each credit type */
export const CREDIT_TYPE_LABELS: Record<CreditType, string> = {
  v0: 'v0',
  gateway: 'AI Gateway',
  agent: 'Vercel Agent',
};

export const creditsSubcommand = {
  name: 'credits',
  aliases: [],
  description: 'Purchase Vercel credits for your team',
  arguments: [
    {
      name: 'credit-type',
      required: true,
    },
    {
      name: 'amount',
      required: true,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Purchase $100 of v0 credits',
      value: `${packageName} buy credits v0 100`,
    },
    {
      name: 'Purchase $250 of AI Gateway credits',
      value: `${packageName} buy credits gateway 250`,
    },
    {
      name: 'Purchase $50 of Vercel Agent credits',
      value: `${packageName} buy credits agent 50`,
    },
  ],
} as const;

export const addonSubcommand = {
  name: 'addon',
  aliases: ['addons'],
  description: 'Purchase a Vercel addon for your team',
  arguments: [
    {
      name: 'addon-name',
      required: false,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Browse and purchase available addons',
      value: `${packageName} buy addon`,
    },
    {
      name: 'Purchase a specific addon',
      value: `${packageName} buy addon <addon-name>`,
    },
  ],
} as const;

export const proSubcommand = {
  name: 'pro',
  aliases: [],
  description: 'Purchase a Vercel Pro subscription for your team',
  arguments: [],
  options: [],
  examples: [
    {
      name: 'Upgrade your team to Vercel Pro',
      value: `${packageName} buy pro`,
    },
  ],
} as const;

export const v0Subcommand = {
  name: 'v0',
  aliases: [],
  description: 'Purchase a v0 subscription for your team',
  arguments: [],
  options: [],
  examples: [
    {
      name: 'Purchase v0 for your team',
      value: `${packageName} buy v0`,
    },
  ],
} as const;

export const domainSubcommand = {
  name: 'domain',
  aliases: [],
  description: 'Purchase a domain name',
  arguments: [
    {
      name: 'domain',
      required: true,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Purchase a domain',
      value: `${packageName} buy domain example.com`,
    },
  ],
} as const;

export const buyCommand = {
  name: 'buy',
  aliases: [],
  description: 'Purchase Vercel products for your team',
  arguments: [],
  subcommands: [
    creditsSubcommand,
    addonSubcommand,
    proSubcommand,
    v0Subcommand,
    domainSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'Purchase $100 of v0 credits',
      value: `${packageName} buy credits v0 100`,
    },
    {
      name: 'Purchase an addon',
      value: `${packageName} buy addon`,
    },
    {
      name: 'Upgrade to Pro',
      value: `${packageName} buy pro`,
    },
    {
      name: 'Purchase v0',
      value: `${packageName} buy v0`,
    },
    {
      name: 'Purchase a domain',
      value: `${packageName} buy domain example.com`,
    },
  ],
} as const;
