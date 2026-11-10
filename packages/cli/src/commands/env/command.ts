import { packageName } from '../../util/pkg-name';
import { getEnvTargetPlaceholder } from '../../util/env/env-target';
import {
  deploymentOption,
  environmentOption,
  forceOption,
  formatOption,
  gitBranchOption,
  jsonOption,
  projectOption,
  yesOption,
} from '../../util/arg-common';

const targetPlaceholder = getEnvTargetPlaceholder();

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List all Environment Variables for a Project',
  arguments: [],
  options: [
    {
      ...environmentOption,
      description: 'List only the variables for this environment',
    },
    {
      ...gitBranchOption,
      description: 'List only the variables for this Git branch',
    },
    {
      ...formatOption,
      description:
        'Specify the output format (json, including readable Environment Variable values)',
    },
    {
      ...jsonOption,
      description:
        'Output as JSON, including readable Environment Variable values',
    },
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
  ],
  options: [
    projectOption,
    {
      ...environmentOption,
      type: [String],
      description:
        'Environments to add the variable to; repeatable or comma-separated. Prompts when omitted',
    },
    {
      ...gitBranchOption,
      description: 'Set the Git branch for a Preview Environment Variable',
    },
    {
      name: 'sensitive',
      description: 'Store the value as a Secret',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'no-sensitive',
      description: 'Store the value as Config',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'type',
      description: 'Set the Environment Variable type (`config` or `secret`)',
      shorthand: null,
      type: String,
      argument: 'TYPE',
      deprecated: false,
    },
    {
      name: 'visibility',
      description: 'Deprecated alias for `--type`',
      shorthand: null,
      type: String,
      argument: 'VISIBILITY',
      deprecated: true,
    },
    {
      ...forceOption,
      description: 'Overwrite an existing variable in the same environment',
      shorthand: null,
    },
    {
      ...yesOption,
      description: 'Accept default choices when adding an Environment Variable',
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
      placeholders: ['<name>'],
      value: `${packageName} env add <name>`,
    },
    {
      name: 'Add a new Environment Variable to a specific Environment',
      placeholders: ['<name>', targetPlaceholder],
      value: `${packageName} env add <name> --environment ${targetPlaceholder}`,
    },
    {
      name: 'Add one variable to multiple Environments (comma-separated)',
      placeholders: ['<name>', '<environment>'],
      value: `${packageName} env add <name> --environment <environment>[,<environment>]`,
    },
    {
      name: 'Override an existing Environment Variable in the same environment (production, preview, development)',
      value: `${packageName} env add API_TOKEN --force`,
    },
    {
      name: 'Add a Config Environment Variable that remains readable later',
      value: `${packageName} env add API_TOKEN --no-sensitive`,
    },
    {
      name: 'Add a new Environment Variable for a specific Environment and Git Branch',
      placeholders: ['<name>', '<BRANCH>', targetPlaceholder],
      value: `${packageName} env add <name> --environment ${targetPlaceholder} --git-branch <BRANCH>`,
    },
    {
      name: 'Add a variable from piped input',
      placeholders: ['<file>', '<name>', targetPlaceholder],
      value: `cat <file> | ${packageName} env add <name> --environment ${targetPlaceholder}`,
    },
    {
      name: 'Add a variable from a file',
      placeholders: ['<file>', '<name>', targetPlaceholder],
      value: `${packageName} env add <name> --environment ${targetPlaceholder} < <file>`,
    },
    {
      name: 'Add with --value for non-interactive use',
      placeholders: ['<value>'],
      value: `${packageName} env add API_TOKEN --environment production --value "<value>" --yes`,
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
  ],
  options: [
    projectOption,
    {
      ...environmentOption,
      description:
        'Remove the variable from this environment only. Without it, the variable is removed from all of its environments',
    },
    {
      ...gitBranchOption,
      description: 'Remove the variable for this Git branch only',
    },
    {
      ...yesOption,
      description:
        'Skip the confirmation prompt when removing an Environment Variable',
    },
  ],
  examples: [
    {
      name: 'Remove a variable from multiple Environments',
      placeholders: ['<name>'],
      value: `${packageName} env remove <name>`,
    },
    {
      name: 'Remove a variable from a specific Environment',
      placeholders: ['<name>', targetPlaceholder],
      value: `${packageName} env remove <name> --environment ${targetPlaceholder}`,
    },
    {
      name: 'Remove a variable from a specific Environment and Git Branch',
      placeholders: ['<name>', '<BRANCH>', targetPlaceholder],
      value: `${packageName} env remove <name> --environment ${targetPlaceholder} --git-branch <BRANCH>`,
    },
  ],
} as const;

export const pullSubcommand = {
  name: 'pull',
  aliases: [],
  description:
    'Pull Environment Variables into a local file (default: .env.local)',
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
      description: 'Select the environment to pull (default: development)',
      shorthand: 'e',
      type: String,
      argument: 'ENVIRONMENT',
      deprecated: false,
    },
    {
      ...gitBranchOption,
      description:
        'Specify the Git branch to pull specific Environment Variables for',
    },
    {
      ...deploymentOption,
      description:
        'Pull Environment Variables for a specific deployment (e.g. dpl_xxx)',
    },
    // `--id` is the deprecated name of `--deployment`.
    { name: 'id', shorthand: null, type: String, deprecated: true },
    {
      ...yesOption,
      description:
        'Skip the confirmation prompt when overwriting an existing file',
    },
  ],
  examples: [
    {
      name: 'Pull Development Environment Variables into a custom file (check .gitignore)',
      placeholders: ['<file>'],
      value: `${packageName} env pull <file>`,
    },
    {
      name: 'Pull Environment Variables for a specific deployment',
      value: `${packageName} env pull --deployment dpl_xxx`,
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
      argument: 'ENVIRONMENT',
      deprecated: false,
    },
    {
      ...gitBranchOption,
      description:
        'Specify the Git branch to pull specific Environment Variables for',
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
  ],
  options: [
    projectOption,
    {
      ...environmentOption,
      description:
        'Pick the variable to update by an environment it covers. The new value applies to all of its environments',
    },
    {
      ...gitBranchOption,
      description: 'Pick the variable to update by its Git branch',
    },
    {
      name: 'sensitive',
      description: 'Store the updated value as a Secret',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
    {
      name: 'type',
      description: 'Set the Environment Variable type (`config` or `secret`)',
      shorthand: null,
      type: String,
      argument: 'TYPE',
      deprecated: false,
    },
    {
      name: 'visibility',
      description: 'Deprecated alias for `--type`',
      shorthand: null,
      type: String,
      argument: 'VISIBILITY',
      deprecated: true,
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
      placeholders: ['<name>'],
      value: `${packageName} env update <name>`,
    },
    {
      name: 'Update the variable that covers a specific Environment',
      placeholders: ['<name>', targetPlaceholder],
      value: `${packageName} env update <name> --environment ${targetPlaceholder}`,
    },
    {
      name: 'Update the variable for a specific Environment and Git Branch',
      placeholders: ['<name>', '<BRANCH>', targetPlaceholder],
      value: `${packageName} env update <name> --environment ${targetPlaceholder} --git-branch <BRANCH>`,
    },
    {
      name: 'Update a variable from piped input',
      placeholders: ['<file>', '<name>', targetPlaceholder],
      value: `cat <file> | ${packageName} env update <name> --environment ${targetPlaceholder}`,
    },
    {
      name: 'Update a variable from a file',
      placeholders: ['<file>', '<name>', targetPlaceholder],
      value: `${packageName} env update <name> --environment ${targetPlaceholder} < <file>`,
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
    updateSubcommand,
  ],
  options: [],
  examples: [
    {
      name: 'Run a command with Environment Variables from the linked Project',
      placeholders: ['<command>'],
      value: `${packageName} env run -- <command>`,
    },
    {
      name: 'Add one variable to multiple Environments',
      value: `${packageName} env add API_URL --environment production,preview,development`,
    },
  ],
} as const;
