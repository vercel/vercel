import { yesOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const addSubCommand = {
  name: 'add',
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

export const openSubCommand = {
  name: 'open',
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
      description: 'limits the resources listed to a designated integration',
      shorthand: 'i',
      type: String,
      deprecated: false,
      argument: 'NAME',
    },
    {
      name: 'all',
      description: 'lists all resources regardless of project',
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
        `${packageName} integrations list --integration <integration>`,
        `${packageName} integrations list --integration acme`,
        `${packageName} integrations list -i acme`,
      ],
    },
    {
      name: 'List all marketplace resources for the current team',
      value: [
        `${packageName} integrations list --all`,
        `${packageName} integrations list -a`,
      ],
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'remove',
  description:
    'Unlink and delete resources, and uninstall marketplace integrations',
  arguments: [
    {
      name: 'resource/integration',
      required: true,
    },
    {
      name: 'project',
      required: false,
    },
  ],
  options: [
    {
      name: 'delete',
      description: 'limits the resources listed to a designated integration',
      shorthand: 'D',
      type: Boolean,
      deprecated: false,
      argument: 'NAME',
    },
    {
      name: 'unlink-all',
      description: 'lists all resources regardless of project',
      shorthand: 'a',
      type: Boolean,
      deprecated: false,
    },
    {
      ...yesOption,
      description:
        'Skip the confirmation prompt when deleting a resource or removing an integration',
    },
  ],
  examples: [
    {
      name: 'Unlink a project from a resource',
      value: [
        `${packageName} integrations remove <resource> <project>`,
        `${packageName} integrations remove my-acme-resource my-project`,
      ],
    },
    {
      name: 'Unlink all projects from a resource',
      value: [
        `${packageName} integrations remove <resource> --unlink-all`,
        `${packageName} integrations remove my-acme-resource --unlink-all`,
        `${packageName} integrations remove my-acme-resource -a`,
      ],
    },
    {
      name: 'Delete an unlinked resource',
      value: [
        `${packageName} integrations remove <resource> --delete`,
        `${packageName} integrations remove my-acme-resource --delete`,
        `${packageName} integrations remove my-acme-resource -D --yes`,
        `${packageName} integrations remove my-acme-resource --unlink-all --delete`,
      ],
    },
    {
      name: 'Uninstall an integration',
      value: [
        `${packageName} integrations remove <inegration>`,
        `${packageName} integrations remove acme`,
      ],
    },
  ],
} as const;

export const integrationCommand = {
  name: 'integration',
  description: 'Manage marketplace integrations',
  options: [],
  arguments: [
    {
      name: 'command',
      required: true,
    },
  ],
  subcommands: [
    addSubCommand,
    openSubCommand,
    listSubcommand,
    removeSubcommand,
  ],
  examples: [],
} as const;
