import { packageName } from '../../util/pkg-name';
import { yesOption } from '../../util/arg-common';

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List all feature flags for the current project',
  default: true,
  arguments: [],
  options: [
    {
      name: 'state',
      shorthand: 's',
      type: String,
      deprecated: false,
      description: 'Filter flags by state (active or archived)',
      argument: 'STATE',
    },
  ],
  examples: [
    {
      name: 'List all active flags',
      value: `${packageName} flags ls`,
    },
    {
      name: 'List archived flags',
      value: `${packageName} flags ls --state archived`,
    },
  ],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: 'Display information about a feature flag',
  arguments: [
    {
      name: 'flag',
      required: true,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Show details of a feature flag',
      value: `${packageName} flags inspect my-feature-flag`,
    },
  ],
} as const;

export const addSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Create a new feature flag',
  arguments: [
    {
      name: 'slug',
      required: true,
    },
  ],
  options: [
    {
      name: 'kind',
      shorthand: 'k',
      type: String,
      deprecated: false,
      description: 'The type of the flag value (boolean, string, or number)',
      argument: 'KIND',
    },
    {
      name: 'description',
      shorthand: 'd',
      type: String,
      deprecated: false,
      description: 'Description of the feature flag',
      argument: 'TEXT',
    },
  ],
  examples: [
    {
      name: 'Create a boolean feature flag',
      value: `${packageName} flags add my-feature`,
    },
    {
      name: 'Create a string feature flag with description',
      value: `${packageName} flags add my-feature --kind string --description "My feature flag"`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Delete a feature flag',
  arguments: [
    {
      name: 'flag',
      required: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when deleting a flag',
    },
  ],
  examples: [
    {
      name: 'Delete a feature flag',
      value: `${packageName} flags rm my-feature-flag`,
    },
    {
      name: 'Delete without confirmation',
      value: `${packageName} flags rm my-feature-flag --yes`,
    },
  ],
} as const;

export const archiveSubcommand = {
  name: 'archive',
  aliases: [],
  description: 'Archive a feature flag',
  arguments: [
    {
      name: 'flag',
      required: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when archiving a flag',
    },
  ],
  examples: [
    {
      name: 'Archive a feature flag',
      value: `${packageName} flags archive my-feature-flag`,
    },
    {
      name: 'Archive without confirmation',
      value: `${packageName} flags archive my-feature-flag --yes`,
    },
  ],
} as const;

export const disableSubcommand = {
  name: 'disable',
  aliases: [],
  description: 'Disable a boolean feature flag in an environment',
  arguments: [
    {
      name: 'flag',
      required: true,
    },
  ],
  options: [
    {
      name: 'environment',
      shorthand: 'e',
      type: String,
      deprecated: false,
      description:
        'The environment to disable the flag in (production, preview, or development)',
      argument: 'ENV',
    },
    {
      name: 'variant',
      shorthand: 'v',
      type: String,
      deprecated: false,
      description: 'The variant ID to serve while the flag is disabled',
      argument: 'VARIANT',
    },
  ],
  examples: [
    {
      name: 'Disable a flag in production',
      value: `${packageName} flags disable my-feature --environment production`,
    },
    {
      name: 'Disable a flag with a specific variant',
      value: `${packageName} flags disable my-feature -e production --variant off`,
    },
  ],
} as const;

export const enableSubcommand = {
  name: 'enable',
  aliases: [],
  description: 'Enable a boolean feature flag in an environment',
  arguments: [
    {
      name: 'flag',
      required: true,
    },
  ],
  options: [
    {
      name: 'environment',
      shorthand: 'e',
      type: String,
      deprecated: false,
      description:
        'The environment to enable the flag in (production, preview, or development)',
      argument: 'ENV',
    },
  ],
  examples: [
    {
      name: 'Enable a flag in production',
      value: `${packageName} flags enable my-feature --environment production`,
    },
  ],
} as const;

// SDK Keys subcommands
export const sdkKeysListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List all SDK keys for the current project',
  arguments: [],
  options: [],
  examples: [
    {
      name: 'List all SDK keys',
      value: `${packageName} flags sdk-keys ls`,
    },
  ],
} as const;

export const sdkKeysAddSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Create a new SDK key',
  arguments: [],
  options: [
    {
      name: 'type',
      // No shorthand: `-t` is already used globally for `--token`
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'The type of SDK key (server, client, or mobile)',
      argument: 'TYPE',
    },
    {
      name: 'environment',
      shorthand: 'e',
      type: String,
      deprecated: false,
      description: 'The environment for the SDK key',
      argument: 'ENV',
    },
    {
      name: 'label',
      shorthand: 'l',
      type: String,
      deprecated: false,
      description: 'Optional label for the SDK key',
      argument: 'LABEL',
    },
  ],
  examples: [
    {
      name: 'Create a server SDK key for production',
      value: `${packageName} flags sdk-keys add --type server --environment production`,
    },
    {
      name: 'Create a client SDK key with a label',
      value: `${packageName} flags sdk-keys add -t client -e preview --label "Preview App"`,
    },
  ],
} as const;

export const sdkKeysRemoveSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Delete an SDK key',
  arguments: [
    {
      name: 'key',
      required: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when deleting an SDK key',
    },
  ],
  examples: [
    {
      name: 'Delete an SDK key',
      value: `${packageName} flags sdk-keys rm <hash-key>`,
    },
  ],
} as const;

export const sdkKeysSubcommand = {
  name: 'sdk-keys',
  aliases: [],
  description: 'Manage SDK keys for feature flags',
  arguments: [],
  subcommands: [
    sdkKeysListSubcommand,
    sdkKeysAddSubcommand,
    sdkKeysRemoveSubcommand,
  ],
  options: [],
  examples: [],
} as const;

export const flagsCommand = {
  name: 'flags',
  aliases: [],
  description: 'Manage feature flags for a Vercel project',
  hidden: true,
  arguments: [],
  subcommands: [
    listSubcommand,
    inspectSubcommand,
    addSubcommand,
    removeSubcommand,
    archiveSubcommand,
    disableSubcommand,
    enableSubcommand,
    sdkKeysSubcommand,
  ],
  options: [],
  examples: [],
} as const;
