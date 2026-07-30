import { packageName } from '../../util/pkg-name';
import {
  yesOption,
  formatOption,
  jsonOption,
  projectOption,
} from '../../util/arg-common';
import {
  CUSTOM_ENVIRONMENT_EXAMPLE_PACK_COUNT,
  CUSTOM_ENVIRONMENTS_PER_PACK,
  customEnvironmentPackEnvironments,
} from '../../util/buy/custom-environment-addon';

const EXAMPLE_CUSTOM_ENVIRONMENT_COUNT = customEnvironmentPackEnvironments(
  CUSTOM_ENVIRONMENT_EXAMPLE_PACK_COUNT
);

export const SUPPORTED_CREDIT_TYPES = ['v0', 'gateway', 'agent'] as const;
export type CreditType = (typeof SUPPORTED_CREDIT_TYPES)[number];

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
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt',
    },
    formatOption,
    jsonOption,
  ],
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

export const SUPPORTED_ADDON_ALIASES = ['siem', 'customEnvironment'] as const;
export type AddonAlias = (typeof SUPPORTED_ADDON_ALIASES)[number];

export const ADDON_LABELS: Record<AddonAlias, string> = {
  siem: 'SIEM',
  customEnvironment: 'Custom Environment',
};

export const addonSubcommand = {
  name: 'addon',
  aliases: ['addons', 'add-on'],
  description: `Purchase a Vercel addon for your team. Supported addons: ${SUPPORTED_ADDON_ALIASES.join(', ')}. Custom environment purchases are per project and use packs (each pack adds ${CUSTOM_ENVIRONMENTS_PER_PACK} environments).`,
  arguments: [
    {
      name: 'addon-name',
      required: true,
    },
    {
      name: 'quantity',
      required: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt',
    },
    jsonOption,
    projectOption,
  ],
  examples: [
    {
      name: 'Purchase 1 SIEM addon',
      value: `${packageName} buy addon siem 1`,
    },
    {
      name: `Purchase ${CUSTOM_ENVIRONMENT_EXAMPLE_PACK_COUNT} custom environment packs (${EXAMPLE_CUSTOM_ENVIRONMENT_COUNT} environments) for a project`,
      value: `${packageName} buy addon customEnvironment ${CUSTOM_ENVIRONMENT_EXAMPLE_PACK_COUNT} --project my-app`,
    },
    {
      name: 'Remove purchased custom environment capacity',
      value: `${packageName} buy addon customEnvironment 0 --project my-app --yes`,
    },
  ],
} as const;

export const proSubcommand = {
  name: 'pro',
  aliases: [],
  description: 'Purchase a Vercel Pro subscription for your team',
  arguments: [],
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Upgrade your team to Vercel Pro',
      value: `${packageName} buy pro`,
    },
    {
      name: 'Upgrade without confirmation prompt',
      value: `${packageName} buy pro --yes`,
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
    domainSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'Purchase $100 of v0 credits',
      value: `${packageName} buy credits v0 100`,
    },
    {
      name: 'Purchase the SIEM addon',
      value: `${packageName} buy addon siem 1`,
    },
    {
      name: 'Upgrade to Pro',
      value: `${packageName} buy pro`,
    },
    {
      name: 'Purchase a domain',
      value: `${packageName} buy domain example.com`,
    },
  ],
} as const;
