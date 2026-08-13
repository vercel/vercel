import { packageName } from '../../util/pkg-name';
import { getEnvTargetPlaceholder } from '../../util/env/env-target';
import {
  forceOption,
  formatOption,
  jsonOption,
  limitOption,
  nextOption,
  projectOption,
  yesOption,
} from '../../util/arg-common';

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
    formatOption,
    jsonOption,
    projectOption,
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
  description: 'Add an Environment Variable',
  arguments: [
    {
      name: 'name',
      required: true,
    },
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
    projectOption,
    {
      name: 'sensitive',
      description: 'Store the value as sensitive for Production or Preview',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'no-sensitive',
      description: 'Store the value as non-sensitive when policy allows',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'visibility',
      description:
        'Set config/secret visibility (`config` or `secret`). Inferred from type when omitted and VERCEL_ENV_VAR_CONFIG_SECRET_UI is set',
      shorthand: null,
      type: String,
      argument: 'VISIBILITY',
      deprecated: false,
    },
    {
      ...forceOption,
      description: 'Overwrite an existing variable for the same target',
      shorthand: null,
    },
    {
      ...yesOption,
      description:
        'Skip the confirmation prompt when adding an Environment Variable',
    },
    {
      name: 'guidance',
      description: 'Show command suggestions after completion',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'value',
      description:
        'Set the variable value for non-interactive use; otherwise use stdin or the prompt',
      shorthand: null,
      type: String,
      argument: 'VALUE',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Add a new variable (prompts for value and Environments)',
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
      name: 'Add one variable to multiple Environments (comma-separated)',
      value: [
        `${packageName} env add <name> <environment>[,<environment>]`,
        `${packageName} env add API_URL production,preview,development`,
      ],
    },
    {
      name: 'Override an existing Environment Variable of same target (production, preview, deployment)',
      value: `${packageName} env add API_TOKEN --force`,
    },
    {
      name: 'Add a regular (non-sensitive) Environment Variable that remains readable later',
      value: `${packageName} env add API_TOKEN --no-sensitive`,
    },
    {
      name: 'Add a new Environment Variable for a specific Environment and Git Branch',
      value: [
        `${packageName} env add <name> ${targetPlaceholder} <gitbranch>`,
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
    {
      name: 'Add with --value for non-interactive use',
      value: `${packageName} env add API_TOKEN production --value "<value>" --yes`,
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
    projectOption,
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
    'Pull all Development Environment Variables from the cloud and write to a file [.env.local]',
  arguments: [
    {
      name: 'filename',
      required: false,
    },
  ],
  options: [
    projectOption,
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
      name: 'id',
      description:
        'Pull environment variables for a specific deployment (e.g. dpl_xxx)',
      shorthand: null,
      type: String,
      argument: 'ID',
      deprecated: false,
    },
    {
      ...yesOption,
      description:
        'Skip the confirmation prompt when removing an environment variable',
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
      name: 'Pull environment variables for a specific deployment',
      value: `${packageName} env pull --id dpl_xxx`,
    },
  ],
} as const;

export const runSubcommand = {
  name: 'run',
  aliases: [],
  description:
    'Run a command with environment variables from the linked Vercel project',
  arguments: [
    {
      name: 'command',
      required: true,
      multiple: true,
    },
  ],
  options: [
    projectOption,
    {
      name: 'environment',
      description:
        'Specify the environment to pull variables from (default: development)',
      shorthand: 'e',
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
  ],
  examples: [
    {
      name: 'Run Next.js dev server with development environment variables',
      value: `${packageName} env run -- next dev`,
    },
    {
      name: 'Run tests with preview environment variables for a specific branch',
      value: `${packageName} env run -e preview --git-branch feature-x -- npm test`,
    },
  ],
} as const;

export const updateSubcommand = {
  name: 'update',
  aliases: [],
  description:
    'Update the value of an existing Environment Variable (see examples below)',
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
    projectOption,
    {
      name: 'sensitive',
      description: 'Update to a sensitive Environment Variable',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'visibility',
      description:
        'Set config/secret visibility (`config` or `secret`). Inferred from type when omitted and VERCEL_ENV_VAR_CONFIG_SECRET_UI is set',
      shorthand: null,
      type: String,
      argument: 'VISIBILITY',
      deprecated: false,
    },
    {
      ...yesOption,
      description:
        'Skip the confirmation prompt when updating an Environment Variable',
    },
    {
      name: 'value',
      description:
        'New value for the variable (non-interactive). Otherwise use stdin or you will be prompted.',
      shorthand: null,
      type: String,
      argument: 'VALUE',
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Update a variable in all Environments',
      value: [
        `${packageName} env update <name>`,
        `${packageName} env update API_TOKEN`,
      ],
    },
    {
      name: 'Update a variable in a specific Environment',
      value: [
        `${packageName} env update <name> ${targetPlaceholder}`,
        `${packageName} env update DB_PASS production`,
      ],
    },
    {
      name: 'Update a variable for a specific Environment and Git Branch',
      value: [
        `${packageName} env update <name> ${targetPlaceholder} <gitbranch>`,
        `${packageName} env update NPM_RC preview feat1`,
      ],
    },
    {
      name: 'Update a variable from stdin',
      value: [
        `cat <file> | ${packageName} env update <name> ${targetPlaceholder}`,
        `cat ~/.npmrc | ${packageName} env update NPM_RC preview`,
        `${packageName} env update API_URL production < url.txt`,
      ],
    },
  ],
} as const;

export const sharedListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List team Shared Environment Variables',
  arguments: [],
  options: [
    formatOption,
    jsonOption,
    limitOption,
    nextOption,
    {
      ...projectOption,
      description: 'Filter to variables linked to a project (name or ID)',
    },
  ],
  examples: [
    {
      name: 'List all Shared Environment Variables for the team',
      value: `${packageName} env shared ls`,
    },
    {
      name: 'List Shared Environment Variables linked to a project',
      value: `${packageName} env shared ls --project my-project`,
    },
  ],
} as const;

export const sharedInspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: 'Show a team Shared Environment Variable in full',
  arguments: [
    {
      name: 'name-or-id',
      required: true,
    },
  ],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Inspect a Shared Environment Variable by name',
      value: `${packageName} env shared inspect API_URL`,
    },
    {
      name: 'Inspect a Shared Environment Variable by ID',
      value: `${packageName} env shared inspect env_XCG7t7AIHuO2SBA8667zNUiM`,
    },
  ],
} as const;

export const sharedAddSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Add a team Shared Environment Variable',
  arguments: [
    {
      name: 'name',
      required: true,
    },
    {
      name: 'value',
      required: false,
    },
  ],
  options: [
    {
      name: 'environment',
      description:
        'Target environment: production, preview, or development (repeatable)',
      shorthand: 'e',
      type: [String],
      argument: 'TARGET',
      deprecated: false,
    },
    {
      name: 'project',
      description: 'Link the variable to a project by ID (repeatable)',
      shorthand: null,
      type: [String],
      argument: 'ID',
      deprecated: false,
    },
    {
      name: 'sensitive',
      description: 'Store the value as sensitive so it cannot be read later',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'comment',
      description: 'Add a comment describing the variable',
      shorthand: null,
      type: String,
      argument: 'TEXT',
      deprecated: false,
    },
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when adding the variable',
    },
  ],
  examples: [
    {
      name: 'Add a Shared Environment Variable to Production and Preview',
      value: `${packageName} env shared add API_URL "<value>" -e production -e preview`,
    },
    {
      name: 'Add a Shared Environment Variable from stdin',
      value: `cat url.txt | ${packageName} env shared add API_URL -e production`,
    },
    {
      name: 'Add a sensitive Shared Environment Variable linked to a project',
      value: `${packageName} env shared add TOKEN -e production --project my-project --sensitive`,
    },
  ],
} as const;

export const sharedUpdateSubcommand = {
  name: 'update',
  aliases: [],
  description: 'Update a team Shared Environment Variable',
  arguments: [
    {
      name: 'name-or-id',
      required: true,
    },
    {
      name: 'value',
      required: false,
    },
  ],
  options: [
    {
      name: 'environment',
      description:
        'Replace the target environments: production, preview, or development (repeatable)',
      shorthand: 'e',
      type: [String],
      argument: 'TARGET',
      deprecated: false,
    },
    {
      name: 'link-project',
      description: 'Link the variable to a project by ID (repeatable)',
      shorthand: null,
      type: [String],
      argument: 'ID',
      deprecated: false,
    },
    {
      name: 'unlink-project',
      description: 'Unlink the variable from a project by ID (repeatable)',
      shorthand: null,
      type: [String],
      argument: 'ID',
      deprecated: false,
    },
    {
      name: 'sensitive',
      description:
        'Update the variable to sensitive so it cannot be read later',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'comment',
      description: 'Update the comment describing the variable',
      shorthand: null,
      type: String,
      argument: 'TEXT',
      deprecated: false,
    },
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when updating the variable',
    },
  ],
  examples: [
    {
      name: 'Update the value of a Shared Environment Variable',
      value: `${packageName} env shared update API_URL "<value>"`,
    },
    {
      name: 'Replace the target environments',
      value: `${packageName} env shared update API_URL -e production -e preview`,
    },
    {
      name: 'Link and unlink projects without deleting the variable',
      value: `${packageName} env shared update API_URL --link-project new-project --unlink-project old-project`,
    },
  ],
} as const;

export const sharedSubcommand = {
  name: 'shared',
  aliases: [],
  description: 'Manage team Shared Environment Variables',
  arguments: [],
  subcommands: [
    sharedListSubcommand,
    sharedInspectSubcommand,
    sharedAddSubcommand,
    sharedUpdateSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'List team Shared Environment Variables',
      value: `${packageName} env shared ls`,
    },
    {
      name: 'Inspect a team Shared Environment Variable',
      value: `${packageName} env shared inspect API_URL`,
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
    runSubcommand,
    sharedSubcommand,
    updateSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'Run a command with Environment Variables from the linked Project',
      value: `${packageName} env run -- <command>`,
    },
    {
      name: 'Add one variable to multiple Environments',
      value: `${packageName} env add API_URL production,preview,development`,
    },
  ],
} as const;
