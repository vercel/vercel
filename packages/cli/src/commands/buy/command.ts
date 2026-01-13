import { packageName } from '../../util/pkg-name';

export const SUPPORTED_CREDIT_CURRENCIES = [
  'v0',
  'ai_gateway',
  'agent',
] as const;
export type CreditCurrency = (typeof SUPPORTED_CREDIT_CURRENCIES)[number];

export const creditsSubcommand = {
  name: 'credits',
  aliases: [],
  description: 'Purchase Vercel credits for your team',
  arguments: [
    {
      name: 'currency',
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
      value: `${packageName} buy credits ai_gateway 250`,
    },
    {
      name: 'Purchase $50 of Agent credits',
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
  ],
} as const;
