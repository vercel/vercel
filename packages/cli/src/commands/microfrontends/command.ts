import { packageName } from '../../util/pkg-name';
import { formatOption, yesOption } from '../../util/arg-common';

export const createGroupSubcommand = {
  name: 'create-group',
  aliases: [],
  description:
    'Create a new microfrontends group to compose multiple projects into one cohesive application with shared routing',
  arguments: [],
  options: [
    {
      name: 'name',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Name of the microfrontends group',
    },
    {
      name: 'project',
      shorthand: null,
      type: [String],
      deprecated: false,
      description: 'Project name to include (repeatable)',
    },
    {
      name: 'default-app',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Project name for the default application',
    },
    {
      name: 'default-route',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Default route for the default application',
    },
    {
      name: 'project-route',
      shorthand: null,
      type: [String],
      deprecated: false,
      description:
        'Default route for a non-default project in the form "<project>=<route>" (repeatable)',
    },
  ],
  examples: [
    {
      name: 'Create a microfrontends group interactively',
      value: `${packageName} microfrontends create-group`,
    },
    {
      name: 'Create a microfrontends group with flags',
      value: `${packageName} mf create-group --name="My Group" --project=web --project=docs --default-app=web --project-route=docs=/docs`,
    },
  ],
} as const;

export const addToGroupSubcommand = {
  name: 'add-to-group',
  aliases: [],
  description:
    'Add the current project to a microfrontends group so it can be independently deployed as part of the microfrontends group',
  arguments: [],
  options: [
    {
      name: 'group',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Name of the microfrontends group to add to',
    },
    {
      name: 'default-route',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Default route for this project (e.g. /docs)',
    },
  ],
  examples: [
    {
      name: 'Add current project to a group interactively',
      value: `${packageName} microfrontends add-to-group`,
    },
    {
      name: 'Add current project to a group with flags',
      value: `${packageName} mf add-to-group --group="My Group" --default-route=/docs`,
    },
  ],
} as const;

export const removeFromGroupSubcommand = {
  name: 'remove-from-group',
  aliases: [],
  description:
    'Remove the current project from its microfrontends group so it is no longer part of the composed application',
  arguments: [],
  options: [
    {
      ...yesOption,
      description: 'Skip project linking confirmation',
    },
  ],
  examples: [
    {
      name: 'Remove current project from its group interactively',
      value: `${packageName} microfrontends remove-from-group`,
    },
  ],
} as const;

export const deleteGroupSubcommand = {
  name: 'delete-group',
  aliases: [],
  description:
    'Delete a microfrontends group and all of its settings. This action is not reversible.',
  arguments: [],
  options: [
    {
      ...yesOption,
      description: 'Skip project linking confirmation',
    },
    {
      name: 'group',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Name or ID of the microfrontends group to delete',
    },
  ],
  examples: [
    {
      name: 'Delete a microfrontends group interactively',
      value: `${packageName} microfrontends delete-group`,
    },
    {
      name: 'Delete a microfrontends group with flags',
      value: `${packageName} mf delete-group --group="My Group"`,
    },
  ],
} as const;

export const pullSubcommand = {
  name: 'pull',
  aliases: [],
  description: 'Pull a Vercel Microfrontends configuration into your project',
  arguments: [],
  options: [
    {
      ...yesOption,
      description:
        'Skip confirmation when linking is required (e.g. in non-interactive mode)',
    },
    {
      name: 'dpl',
      shorthand: null,
      deprecated: false,
      type: String,
      description:
        'The deploymentId to use for pulling the microfrontends configuration',
    },
  ],
  examples: [
    {
      name: 'Pull a microfrontends configuration',
      value: `${packageName} microfrontends pull`,
    },
    {
      name: 'Pull a microfrontends configuration for a specific deployment',
      value: `${packageName} microfrontends pull --dpl=<deployment-id>`,
    },
  ],
} as const;

export const inspectGroupSubcommand = {
  name: 'inspect-group',
  aliases: [],
  description:
    'Inspect a microfrontends group and return project metadata used for setup automation',
  arguments: [],
  options: [
    {
      name: 'group',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Name or ID of the microfrontends group to inspect',
    },
    {
      name: 'config-file-name',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Custom microfrontends config file path/name relative to the default app root (must end with .json or .jsonc)',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Inspect a microfrontends group interactively',
      value: `${packageName} microfrontends inspect-group`,
    },
    {
      name: 'Inspect a microfrontends group as JSON',
      value: `${packageName} mf inspect-group --group="My Group" --format=json`,
    },
  ],
} as const;

export const microfrontendsCommand = {
  name: 'microfrontends',
  aliases: ['mf'],
  description:
    'Manage microfrontends groups that compose multiple projects into one cohesive application',
  arguments: [],
  subcommands: [
    createGroupSubcommand,
    addToGroupSubcommand,
    removeFromGroupSubcommand,
    deleteGroupSubcommand,
    inspectGroupSubcommand,
    pullSubcommand,
  ],
  options: [],
  examples: [],
} as const;
