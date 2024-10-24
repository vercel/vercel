import { yesOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const addSubcommand = {
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

export const openSubcommand = {
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

export const uninstallSubcommand = {
  name: 'uninstall',
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
        `${packageName} integrations uninstall <inegration>`,
        `${packageName} integrations uninstall acme`,
      ],
    },
  ],
} as const;

export const deleteSubcommand = {
  name: 'delete',
  description: 'Delete an integration resource',
  arguments: [
    {
      name: 'resource',
      required: true,
    },
  ],
  options: [
    {
      name: 'disconnect-all',
      description: 'disconnects all projects from the specified resource',
      shorthand: 'a',
      type: Boolean,
      deprecated: false,
    },
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when deleting a resource',
    },
  ],
  examples: [
    {
      name: 'Delete a resource',
      value: [
        `${packageName} integrations delete <resource>`,
        `${packageName} integrations delete my-acme-resource`,
      ],
    },
    {
      name: 'Disconnect all projects from a resource, then delete it',
      value: [
        `${packageName} integrations delete <resource> --disconnect-all`,
        `${packageName} integrations delete my-acme-resource --disconnect-all`,
        `${packageName} integrations delete my-acme-resource -a`,
      ],
    },
  ],
} as const;

export const disconnectSubcommand = {
  name: 'disconnect',
  description: 'Disconnect a resource from a project, or the current project',
  arguments: [
    {
      name: 'resource',
      required: true,
    },
    {
      name: 'project',
      required: false,
    },
  ],
  options: [
    {
      name: 'all',
      description: 'disconnects all projects from the specified resource',
      shorthand: 'a',
      type: Boolean,
      deprecated: false,
    },
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when disconnecting a resource',
    },
  ],
  examples: [
    {
      name: 'Disconnect a resource from the current projecct',
      value: [
        `${packageName} integrations disconnect <resource>`,
        `${packageName} integrations disconnect my-acme-resource`,
      ],
    },
    {
      name: 'Disconnect all projects from a resource',
      value: [
        `${packageName} integrations disconnect <resource> --unlink-all`,
        `${packageName} integrations disconnect my-acme-resource --all`,
        `${packageName} integrations disconnect my-acme-resource -a`,
      ],
    },
    {
      name: 'Disconnect a resource from a specified project',
      value: [
        `${packageName} integrations disconnect <resource> <project>`,
        `${packageName} integrations disconnect my-acme-resource my-project`,
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
    addSubcommand,
    listSubcommand,
    openSubcommand,
    disconnectSubcommand,
    deleteSubcommand,
    uninstallSubcommand,
  ],
  examples: [],
} as const;
