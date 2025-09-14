import { packageName } from '../../util/pkg-name';
import { getEnvTargetPlaceholder } from '../../util/env/env-target';
import { forceOption, yesOption } from '../../util/arg-common';

const targetPlaceholder = getEnvTargetPlaceholder();

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List all Environment Variables for a Project',
  arguments: [
    {
      name: 'environment',
      required: false,
    },
    {
      name: 'git-branch',
      required: false,
    },
  ],
  options: [
    {
      name: 'guidance',
      description: 'Receive command suggestions once command is complete',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
  ],
  examples: [],
} as const;

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Add an Environment Variable (see examples below)',
  arguments: [
    {
      name: 'name',
      required: true,
    },
    {
      name: 'environment',
      required: false,
    },
  ],
  options: [
    {
      name: 'sensitive',
      description: 'Add a sensitive Environment Variable',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      ...forceOption,
      description: 'Force overwrites when a command would normally fail',
      shorthand: null,
    },
    {
      name: 'guidance',
      description: 'Receive command suggestions once command is complete',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Add a new variable to all Environments',
      value: [
        `${packageName} env add <name>`,
        `${packageName} env add API_TOKEN`,
      ],
    },
    {
      name: 'Add a new Environment Variable to a specific Environment',
      value: [
        `${packageName} env add <name> ${targetPlaceholder}`,
        `${packageName} env add DB_PASS production`,
      ],
    },
    {
      name: 'Override an existing Environment Variable of same target (production, preview, deployment)',
      value: `${packageName} env add API_TOKEN --force`,
    },
    {
      name: 'Add a sensitive Environment Variable',
      value: `${packageName} env add API_TOKEN --sensitive`,
    },
    {
      name: 'Add a new Environment Variable for a specific Environment and Git Branch',
      value: [
        `${packageName} env add <name> ${targetPlaceholder} <git-branch>`,
        `${packageName} env add DB_PASS preview feat1`,
      ],
    },
    {
      name: 'Add a new Environment Variable from stdin',
      value: [
        `cat <file> | ${packageName} env add <name> ${targetPlaceholder}`,
        `cat ~/.npmrc | ${packageName} env add NPM_RC preview`,
        `${packageName} env add API_URL production < url.txt`,
      ],
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Remove an Environment Variable (see examples below)',
  arguments: [
    {
      name: 'name',
      required: true,
    },
    {
      name: 'environment',
      required: false,
    },
  ],
  options: [
    {
      ...yesOption,
      description:
        'Skip the confirmation prompt when removing an Environment Variable',
    },
  ],
  examples: [
    {
      name: 'Remove a variable from multiple Environments',
      value: [
        `${packageName} env rm <name>`,
        `${packageName} env rm API_TOKEN`,
      ],
    },
    {
      name: 'Remove a variable from a specific Environment',
      value: [
        `${packageName} env rm <name> ${targetPlaceholder}`,
        `${packageName} env rm NPM_RC preview`,
      ],
    },
    {
      name: 'Remove a variable from a specific Environment and Git Branch',
      value: [
        `${packageName} env rm <name> ${targetPlaceholder} <gitbranch>`,
        `${packageName} env rm NPM_RC preview feat1`,
      ],
    },
  ],
} as const;

export const pullSubcommand = {
  name: 'pull',
  aliases: [],
  description:
    'Load all Development Environment Variables from the cloud to a file [.env.local] or a process',
  arguments: [
    {
      name: 'filename',
      required: false,
    },
    {
      name: 'command',
      required: false,
    },
  ],
  options: [
    {
      name: 'environment',
      description: 'Set the Environment when pulling Environment Variables',
      shorthand: null,
      type: String,
      argument: 'TARGET',
      deprecated: false,
    },
    {
      name: 'git-branch',
      description:
        'Specify the Git branch to pull specific Environment Variables for',
      shorthand: null,
      type: String,
      argument: 'NAME',
      deprecated: false,
    },
    {
      ...yesOption,
      description:
        'Skip the confirmation prompt when updating an existing environment variable file',
    },
    {
      name: 'memory',
      shorthand: null,
      description:
        'Load Environment Variables into memory instead of a file. When this command exits, the variables are lost.',
      type: Boolean,
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Pull all Development Environment Variables down from the cloud',
      value: [
        `${packageName} env pull <file>`,
        `${packageName} env pull .env.development.local`,
      ],
    },
    {
      name: 'Run a process with the pulled Environment Variables without writing to a file',
      value: [`${packageName} env <command>`, `${packageName} env next dev`],
    },
  ],
} as const;

export const commandSubcommand = {
  name: '<command>',
  aliases: [],
  description: 'The subcommand to run with the pulled Environment Variables',
  arguments: [],
  options: [],
  examples: [
    {
      name: 'Run a process with the pulled Environment Variables without writing to a file',
      value: [`${packageName} env <command>`, `${packageName} env next dev`],
    },
  ],
} as const;

export const envCommand = {
  name: 'env',
  aliases: [],
  description: 'Interact with Environment Variables for a Project',
  arguments: [],
  subcommands: [
    addSubcommand,
    listSubcommand,
    pullSubcommand,
    removeSubcommand,
    commandSubcommand,
  ],
  options: [],
  examples: [],
} as const;
