import { formatOption, jsonOption, yesOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Installs a marketplace integration',
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
      shorthand: 'n',
      type: String,
      deprecated: false,
      argument: 'NAME',
    },
    {
      name: 'metadata',
      description:
        'Metadata for the resource as KEY=VALUE (can be repeated). Run `vercel integration add <name> --help` to see available keys.',
      shorthand: 'm',
      type: [String],
      deprecated: false,
      argument: 'KEY=VALUE',
    },
    {
      name: 'plan',
      shorthand: 'p',
      type: String,
      deprecated: false,
      argument: 'PLAN_ID',
      description: 'Billing plan ID to use for the resource',
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
      argument: 'ENV',
      description:
        'Environment to connect (can be repeated: production, preview, development). Defaults to all.',
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
      name: 'installation-id',
      shorthand: null,
      type: String,
      deprecated: false,
      argument: 'ID',
      description:
        'Installation ID to use when multiple installations exist for the integration',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Install a marketplace integration (auto-generates resource name)',
      value: [
        `${packageName} integration add <integration-name>`,
        `${packageName} integration add acme`,
      ],
    },
    {
      name: 'Install a specific product from an integration',
      value: [
        `${packageName} integration add <integration>/<product>`,
        `${packageName} integration add acme/acme-redis`,
      ],
    },
    {
      name: 'Install with a custom resource name',
      value: [
        `${packageName} integration add acme --name my-database`,
        `${packageName} integration add acme -n my-database`,
      ],
    },
    {
      name: 'Install with metadata options',
      value: [
        `${packageName} integration add acme --metadata region=us-east-1`,
        `${packageName} integration add acme -m region=us-east-1 -m version=16`,
        `${packageName} integration add acme -m auth=true`,
        `${packageName} integration add acme -m "readRegions=sfo1,iad1"`,
      ],
    },
    {
      name: 'Install with a specific billing plan',
      value: [
        `${packageName} integration add acme --plan pro`,
        `${packageName} integration add acme -p pro`,
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
      value: `${packageName} integration add acme --format=json`,
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
  options: [formatOption],
  examples: [
    {
      name: "Open a marketplace integration's dashboard",
      value: [
        `${packageName} integration open <integration-name>`,
        `${packageName} integration open acme`,
      ],
    },
    {
      name: "Open a resource's dashboard within an integration",
      value: [
        `${packageName} integration open <integration-name> <resource-name>`,
        `${packageName} integration open acme my-acme-store`,
      ],
    },
    {
      name: 'Get the SSO link as JSON',
      value: [
        `${packageName} integration open acme --format=json`,
        `${packageName} integration open acme my-acme-store --format=json`,
      ],
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
      shorthand: 'i',
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
  ],
  examples: [
    {
      name: 'List resources for the current linked project',
      value: [`${packageName} integration list`],
    },
    {
      name: 'Filter the resources to a single integration',
      value: [
        `${packageName} integration list --integration <integration>`,
        `${packageName} integration list --integration acme`,
        `${packageName} integration list -i acme`,
      ],
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
      value: [`${packageName} integration list --format=json`],
    },
  ],
} as const;

export const discoverSubcommand = {
  name: 'discover',
  aliases: [],
  description: 'Discover available marketplace integrations',
  arguments: [],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Discover marketplace integrations',
      value: [`${packageName} integration discover`],
    },
    {
      name: 'Discover marketplace integrations as JSON',
      value: [`${packageName} integration discover --format=json`],
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
  options: [formatOption],
  examples: [
    {
      name: 'Show the balance(s) & threshold(s) of a marketplace integration',
      value: [
        `${packageName} integration balance <integration-name>`,
        `${packageName} integration balance acme`,
      ],
    },
    {
      name: 'Output as JSON',
      value: `${packageName} integration balance acme --format=json`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: [],
  description: 'Uninstalls a marketplace integration',
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
        'Skip the confirmation prompt when uninstalling an integration',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Uninstall an integration',
      value: [
        `${packageName} integration remove <integration>`,
        `${packageName} integration remove acme`,
      ],
    },
    {
      name: 'Output as JSON',
      value: `${packageName} integration remove acme --format=json --yes`,
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
      shorthand: 'f',
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
      value: [
        `${packageName} integration guide <integration-name>`,
        `${packageName} integration guide neon`,
      ],
    },
    {
      name: 'Show guides for a specific product of a multi-product integration',
      value: [
        `${packageName} integration guide <integration>/<product>`,
        `${packageName} integration guide aws/aws-dynamodb`,
      ],
    },
    {
      name: 'Show the Next.js guide without prompts (useful for CI/agents)',
      value: `${packageName} integration guide neon --framework nextjs`,
    },
  ],
} as const;

export const integrationCommand = {
  name: 'integration',
  aliases: [],
  description: 'Manage marketplace integrations',
  options: [],
  arguments: [],
  subcommands: [
    addSubcommand,
    balanceSubcommand,
    discoverSubcommand,
    guideSubcommand,
    listSubcommand,
    openSubcommand,
    removeSubcommand,
  ],
  examples: [
    {
      name: 'Install a specific product from an integration',
      value: `${packageName} integration add acme/acme-redis`,
    },
  ],
} as const;
