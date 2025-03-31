import { yesOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Installs a marketplace integration',
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Install a marketplace integration',
      value: [
        `${packageName} integration add <integration-name>`,
        `${packageName} integration add acme`,
      ],
    },
  ],
} as const;

export const openSubcommand = {
  name: 'open',
  aliases: [],
  description: "Opens a marketplace integration's dashboard",
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
  options: [],
  examples: [
    {
      name: "Open a marketplace integration's dashboard",
      value: [
        `${packageName} integration open <integration-name>`,
        `${packageName} integration open acme`,
      ],
    },
  ],
} as const;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'Lists all resources from marketplace integrations',
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
  ],
  examples: [
    {
      name: 'List all resources',
      value: [`${packageName} integrations list`],
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
  ],
} as const;

export const balanceSubcommand = {
  name: 'balance',
  aliases: [],
  description:
    'Shows the balances and thresholds of specified marketplace integration',
  arguments: [
    {
      name: 'integration',
      required: true,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Show the balance(s) & threshold(s) of a marketplace integration',
      value: [
        `${packageName} integration balance <integration-name>`,
        `${packageName} integration balance acme`,
      ],
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
  ],
  examples: [
    {
      name: 'Uninstall an integration',
      value: [
        `${packageName} integration remove <inegration>`,
        `${packageName} integration remove acme`,
      ],
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
    listSubcommand,
    openSubcommand,
    removeSubcommand,
  ],
  examples: [],
} as const;
