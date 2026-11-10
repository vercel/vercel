import { formatOption, jsonOption, yesOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';
import {
  claimSubcommand,
  connectSubcommand,
  createThresholdSubcommand,
  disconnectSubcommand,
  inspectSubcommand,
  removeSubcommand as resourceRemoveSubcommand,
} from '../integration-resource/command';

export const addSubcommand = {
  name: 'add',
  aliases: ['install'],
  description: 'Installs a marketplace integration',
  dynamicHelp: true,
  arguments: [
    {
      name: 'integration',
      required: true,
    },
  ],
  options: [
    {
      name: 'name',
      description:
        'Custom name for the resource (auto-generated if not provided)',
      shorthand: null,
      deprecatedShorthand: 'n',
      type: String,
      deprecated: false,
      argument: 'NAME',
    },
    {
      name: 'meta',
      description:
        'Metadata for the resource as KEY=VALUE (can be repeated). Run `vercel integration add <name> --help` to see available keys.',
      shorthand: null,
      type: [String],
      deprecated: false,
      argument: 'KEY=VALUE',
    },
    // Hidden: `--metadata` and `-m` are the old names of `--meta`.
    {
      name: 'metadata',
      description: 'Deprecated alias for `--meta`',
      shorthand: 'm',
      type: [String],
      deprecated: true,
      argument: 'KEY=VALUE',
    },
    {
      name: 'billing-plan',
      shorthand: null,
      type: String,
      deprecated: false,
      argument: 'BILLING_PLAN',
      description: 'Billing plan ID to use for the resource',
    },
    // Hidden: `--plan` and `-p` are the old names of `--billing-plan`.
    {
      name: 'plan',
      shorthand: 'p',
      type: String,
      deprecated: true,
      argument: 'PLAN_ID',
      description: 'Deprecated alias for `--billing-plan`',
    },
    {
      name: 'no-connect',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Skip connecting the resource to the current project (also skips env pull)',
    },
    {
      name: 'no-env-pull',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Skip running env pull after provisioning',
    },
    {
      name: 'environment',
      shorthand: 'e',
      type: [String],
      deprecated: false,
      argument: 'ENVIRONMENT',
      description:
        'Environment to connect. Accepts production, preview, development, or a Custom Environment slug or ID from the linked project. Can be repeated (default: all built-in environments).',
    },
    {
      name: 'prefix',
      shorthand: null,
      type: String,
      deprecated: false,
      argument: 'PREFIX',
      description:
        'Prefix for environment variable names (e.g., --prefix NEON2_ creates NEON2_DATABASE_URL instead of DATABASE_URL)',
    },
    {
      name: 'installation',
      shorthand: null,
      type: String,
      deprecated: false,
      argument: 'INSTALLATION',
      description:
        'Installation ID to use when multiple installations exist for the integration',
    },
    // Hidden: `--installation-id` is the old name of `--installation`.
    {
      name: 'installation-id',
      shorthand: null,
      type: String,
      deprecated: true,
      argument: 'ID',
      description: 'Deprecated alias for `--installation`',
    },
    {
      name: 'claim',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'If the new resource is a sandbox (e.g. Stripe, Shopify), claim it immediately without prompting',
    },
    {
      name: 'no-claim',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'If the new resource is a sandbox, skip the offer to claim it (only print a hint)',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Install a marketplace integration (auto-generates resource name)',
      placeholders: ['<integration-name>'],
      value: `${packageName} integration add <integration-name>`,
    },
    {
      name: 'Install a specific product from an integration',
      placeholders: ['<integration>', '<product>'],
      value: `${packageName} integration add <integration>/<product>`,
    },
    {
      name: 'Search by keyword (prompts to select a matching integration)',
      value: [
        `${packageName} integration add postgres`,
        `${packageName} integration add redis`,
      ],
    },
    {
      name: 'Install with a custom resource name',
      value: [
        `${packageName} integration add acme --name my-database`,
        `${packageName} integration add acme --name my-database`,
      ],
    },
    {
      name: 'Install with metadata options',
      value: [
        `${packageName} integration add acme --meta region=us-east-1`,
        `${packageName} integration add acme --meta region=us-east-1 --meta version=16`,
        `${packageName} integration add acme --meta auth=true`,
        `${packageName} integration add acme --meta "readRegions=sfo1,iad1"`,
      ],
    },
    {
      name: 'Install with a specific billing plan',
      value: [
        `${packageName} integration add acme --billing-plan pro`,
        `${packageName} integration add acme --billing-plan pro`,
      ],
    },
    {
      name: 'Install and connect to specific environments only',
      value: [
        `${packageName} integration add acme --environment production`,
        `${packageName} integration add acme -e production -e preview`,
      ],
    },
    {
      name: 'Install without connecting to the current project',
      value: `${packageName} integration add acme --no-connect`,
    },
    {
      name: 'Install without pulling environment variables',
      value: `${packageName} integration add acme --no-env-pull`,
    },
    {
      name: 'Install with a prefix for environment variable names',
      value: `${packageName} integration add acme --prefix NEON2_`,
    },
    {
      name: 'Output as JSON',
      value: `${packageName} integration add acme --json`,
    },
    {
      name: 'Show available products for an integration',
      value: `${packageName} integration add acme --help`,
    },
    {
      name: 'Discover available marketplace products and their slugs',
      value: `${packageName} integration discover`,
    },
  ],
} as const;

export const acceptTermsSubcommand = {
  descriptionTone: 'normal',
  name: 'accept-terms',
  aliases: [],
  description:
    'Accept marketplace legal terms for an integration and install it on the current team (installation only; no product resource). Requires an interactive terminal and human confirmation, unless `--yes` is passed (supported for `neon` only). Does not replace integrations that require a browser or device attestation.',
  arguments: [
    {
      name: 'integration',
      required: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description:
        'Accept the terms without a confirmation prompt. Only supported for the `neon` integration.',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Accept terms interactively, then install on the team',
      placeholders: ['<integration>'],
      value: `${packageName} integration accept-terms <integration>`,
    },
    {
      name: 'Output result as JSON',
      value: `${packageName} integration accept-terms neon --json`,
    },
    {
      name: 'Accept terms without a prompt (neon only)',
      value: `${packageName} integration accept-terms neon --yes`,
    },
  ],
} as const;

type FlagValue<T> = T extends readonly [StringConstructor]
  ? string[]
  : T extends StringConstructor
    ? string
    : T extends BooleanConstructor
      ? boolean
      : T extends NumberConstructor
        ? number
        : never;

export type IntegrationAddFlags = {
  [K in (typeof addSubcommand.options)[number] as `--${K['name']}`]?: FlagValue<
    K['type']
  >;
};

export const openSubcommand = {
  name: 'open',
  aliases: [],
  description:
    "Opens a marketplace integration's or resource's dashboard via SSO",
  arguments: [
    {
      name: 'name',
      required: true,
    },
    {
      name: 'resource',
      required: false,
    },
  ],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: "Open a marketplace integration's dashboard",
      placeholders: ['<integration-name>'],
      value: `${packageName} integration open <integration-name>`,
    },
    {
      name: "Open a resource's dashboard within an integration",
      placeholders: ['<integration-name>', '<resource-name>'],
      value: `${packageName} integration open <integration-name> <resource-name>`,
    },
    {
      name: 'Get the SSO link as JSON',
      value: [
        `${packageName} integration open acme --json`,
        `${packageName} integration open acme my-acme-store --json`,
      ],
    },
  ],
} as const;

export const installationsSubcommand = {
  name: 'installations',
  aliases: ['installation'],
  description:
    'List marketplace integration installations for the current team (account scope)',
  arguments: [],
  options: [
    {
      name: 'integration',
      description: 'Limit to installations of this integration (slug or id)',
      shorthand: null,
      deprecatedShorthand: 'i',
      type: String,
      deprecated: false,
      argument: 'SLUG_OR_ID',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'List all marketplace installations for the team',
      value: [`${packageName} integration installations`],
    },
    {
      name: 'Filter by integration slug',
      value: [`${packageName} integration installations --integration neon`],
    },
    {
      name: 'JSON output',
      value: [`${packageName} integration installations --json`],
    },
  ],
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description:
    'List resources from marketplace integrations for the current project',
  arguments: [
    {
      name: 'project',
      required: false,
    },
  ],
  options: [
    {
      name: 'integration',
      description: 'Limits the resources listed to a designated integration',
      shorthand: null,
      deprecatedShorthand: 'i',
      type: String,
      deprecated: false,
      argument: 'NAME',
    },
    {
      name: 'all',
      description: 'Lists all resources regardless of project',
      shorthand: 'a',
      type: Boolean,
      deprecated: false,
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'List resources for the current linked project',
      value: [`${packageName} integration list`],
    },
    {
      name: 'Filter the resources to a single integration',
      placeholders: ['<integration>'],
      value: `${packageName} integration list --integration <integration>`,
    },
    {
      name: 'List all marketplace resources for the current team',
      value: [
        `${packageName} integration list --all`,
        `${packageName} integration list -a`,
      ],
    },
    {
      name: 'List resources as JSON',
      value: [`${packageName} integration list --json`],
    },
  ],
} as const;

export const discoverSubcommand = {
  name: 'discover',
  aliases: [],
  description: 'Discover available marketplace integrations',
  arguments: [
    {
      name: 'query',
      required: false,
    },
  ],
  options: [
    {
      name: 'category',
      shorthand: null,
      deprecatedShorthand: 'c',
      type: [String],
      deprecated: false,
      argument: 'CATEGORY',
      description:
        'Filter integrations by category (can be repeated; e.g., --category storage --category authentication). Run `vercel integration categories` for valid slugs.',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Discover marketplace integrations',
      value: [`${packageName} integration discover`],
    },
    {
      name: 'Search for integrations matching a query',
      value: [
        `${packageName} integration discover postgres`,
        `${packageName} integration discover aws`,
      ],
    },
    {
      name: 'Filter integrations by category',
      value: [
        `${packageName} integration discover --category storage`,
        `${packageName} integration discover --category authentication`,
      ],
    },
    {
      name: 'Filter by multiple categories at once (repeat the option)',
      value: [
        `${packageName} integration discover --category storage --category authentication`,
        `${packageName} integration discover --category commerce --category payments --category authentication`,
      ],
    },
    {
      name: 'List available category slugs to use with --category',
      value: [`${packageName} integration categories`],
    },
    {
      name: 'Discover marketplace integrations as JSON',
      value: [`${packageName} integration discover --json`],
    },
  ],
} as const;

export const categoriesSubcommand = {
  name: 'categories',
  aliases: [],
  description:
    'List marketplace integration categories (slugs valid for `integration discover --category`)',
  arguments: [],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'List marketplace categories',
      value: [`${packageName} integration categories`],
    },
    {
      name: 'List categories as JSON',
      value: [`${packageName} integration categories --json`],
    },
    {
      name: 'Use a category slug to filter discover results',
      value: [`${packageName} integration discover --category storage`],
    },
  ],
} as const;

export const balanceSubcommand = {
  name: 'balance',
  aliases: [],
  description:
    'Shows the balances and thresholds of a specified marketplace integration',
  arguments: [
    {
      name: 'integration',
      required: true,
    },
  ],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Show the balance(s) & threshold(s) of a marketplace integration',
      placeholders: ['<integration-name>'],
      value: `${packageName} integration balance <integration-name>`,
    },
    {
      name: 'Output as JSON',
      value: `${packageName} integration balance acme --json`,
    },
  ],
} as const;

export const updateSubcommand = {
  descriptionTone: 'normal',
  name: 'update',
  aliases: [],
  description:
    'Update a marketplace integration installation (billing plan or which projects can access it). ' +
    'Install, remove, and connect flows are separate (integration add, integration remove, integration resource, env pull, etc.) — not part of update. ' +
    'UI-only flows (OAuth in a browser, consent screens, marketplace purchase) may not map one-to-one to a single CLI option; pass --billing-plan and --authorization when the product requires them for billing changes. ' +
    'Any extra fields on the configuration resource that the API exposes but this command PATCH body does not send are not covered until the API and CLI support them.',
  arguments: [
    {
      name: 'integration',
      required: true,
    },
  ],
  options: [
    {
      name: 'billing-plan',
      shorthand: null,
      type: String,
      deprecated: false,
      argument: 'BILLING_PLAN',
      description:
        'Billing plan ID for integrations that support installation-level billing plans',
    },
    // Hidden: `--plan` and `-p` are the old names of `--billing-plan`.
    {
      name: 'plan',
      shorthand: 'p',
      type: String,
      deprecated: true,
      argument: 'PLAN_ID',
      description: 'Deprecated alias for `--billing-plan`',
    },
    {
      name: 'authorization',
      shorthand: null,
      type: String,
      deprecated: false,
      argument: 'AUTHORIZATION',
      description:
        'Billing authorization ID when the platform requires it for plan changes',
    },
    // Hidden: `--authorization-id` is the old name of `--authorization`.
    {
      name: 'authorization-id',
      shorthand: null,
      type: String,
      deprecated: true,
      argument: 'ID',
      description: 'Deprecated alias for `--authorization`',
    },
    {
      name: 'projects',
      shorthand: null,
      type: [String],
      deprecated: false,
      argument: 'PROJECT',
      description:
        'Project ID allowed to use this installation, or "all" for all projects (repeatable)',
    },
    {
      name: 'installation',
      shorthand: null,
      type: String,
      deprecated: false,
      argument: 'INSTALLATION',
      description:
        'Configuration ID when multiple marketplace installations exist for this integration',
    },
    // Hidden: `--installation-id` is the old name of `--installation`.
    {
      name: 'installation-id',
      shorthand: null,
      type: String,
      deprecated: true,
      argument: 'ID',
      description: 'Deprecated alias for `--installation`',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Grant all team projects access to the integration',
      placeholders: ['<integration>'],
      value: `${packageName} integration update <integration> --projects all`,
    },
    {
      name: 'Limit access to specific projects',
      value: `${packageName} integration update neon --projects prj_abc --projects prj_def`,
    },
    {
      name: 'Change installation billing plan',
      value: `${packageName} integration update acme --billing-plan pro`,
    },
    {
      name: 'Select installation when several exist',
      value: `${packageName} integration update neon --installation icfg_xxx --projects all`,
    },
    {
      name: 'Output result as JSON',
      value: `${packageName} integration update neon --projects all --json`,
    },
    {
      name: 'Non-interactive (JSON success and errors on stdout)',
      value: `${packageName} integration update neon --projects all --non-interactive`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description:
    'Remove a marketplace integration. Resources must be deleted first using `integration resource delete`.',
  arguments: [
    {
      name: 'integration',
      required: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when removing an integration',
    },
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Remove an integration',
      placeholders: ['<integration>'],
      value: `${packageName} integration remove <integration>`,
    },
    {
      name: 'Delete a resource before removing the integration',
      placeholders: ['<resource-name>'],
      value: `${packageName} integration resource delete <resource-name> --disconnect-all --yes`,
    },
    {
      name: 'Output as JSON',
      value: `${packageName} integration remove acme --json --yes`,
    },
  ],
} as const;

export const guideSubcommand = {
  name: 'guide',
  aliases: [],
  description:
    'Show getting started guides and code snippets for a marketplace integration',
  arguments: [
    {
      name: 'integration',
      required: true,
    },
  ],
  options: [
    {
      name: 'framework',
      shorthand: null,
      deprecatedShorthand: 'f',
      type: String,
      deprecated: false,
      argument: 'FRAMEWORK',
      description:
        'Select a framework guide without interactive prompt (e.g., nextjs, remix, astro, nuxtjs, sveltekit)',
    },
  ],
  examples: [
    {
      name: 'Show guides for a single-product integration',
      placeholders: ['<integration-name>'],
      value: `${packageName} integration guide <integration-name>`,
    },
    {
      name: 'Show guides for a specific product of a multi-product integration',
      placeholders: ['<integration>', '<product>'],
      value: `${packageName} integration guide <integration>/<product>`,
    },
    {
      name: 'Show the Next.js guide without prompts (useful for CI/agents)',
      value: `${packageName} integration guide neon --framework nextjs`,
    },
    {
      name: 'Discover available integrations and product slugs',
      value: `${packageName} integration discover`,
    },
  ],
} as const;

export const resourceSubcommand = {
  name: 'resource',
  aliases: [],
  description:
    'Manage marketplace integration resources (inspect, connect, disconnect, delete, claim, create-threshold)',
  options: [],
  arguments: [],
  subcommands: [
    connectSubcommand,
    createThresholdSubcommand,
    disconnectSubcommand,
    resourceRemoveSubcommand,
    claimSubcommand,
    inspectSubcommand,
  ],
  examples: [
    {
      name: 'Connect a resource to the current project',
      value: `${packageName} integration resource connect my-acme-resource`,
    },
    {
      name: 'Disconnect a resource from the current project',
      value: `${packageName} integration resource disconnect my-acme-resource`,
    },
    {
      name: 'Delete a resource (disconnecting all projects first)',
      value: `${packageName} integration resource delete my-acme-resource --disconnect-all --yes`,
    },
  ],
} as const;

export const integrationCommand = {
  name: 'integration',
  aliases: [],
  description:
    'Manage marketplace integrations. To manage individual resources, see `vercel integration resource`.',
  options: [],
  arguments: [],
  subcommands: [
    addSubcommand,
    acceptTermsSubcommand,
    balanceSubcommand,
    categoriesSubcommand,
    discoverSubcommand,
    guideSubcommand,
    installationsSubcommand,
    listSubcommand,
    openSubcommand,
    resourceSubcommand,
    updateSubcommand,
    removeSubcommand,
  ],
  examples: [
    {
      name: 'Install a specific product from an integration',
      value: `${packageName} integration add acme/acme-redis`,
    },
    {
      name: 'Connect an existing resource to the current project',
      value: `${packageName} integration resource connect my-acme-resource`,
    },
  ],
} as const;
