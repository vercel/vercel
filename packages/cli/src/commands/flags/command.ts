import { yesOption } from '../../util/arg-common';
import { formatFlagConditionComparatorList } from '../../util/flags/comparators';
import { packageName } from '../../util/pkg-name';

const segmentRuleOperatorDescription = `Valid operators: ${formatFlagConditionComparatorList()}`;

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
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output in JSON format',
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
    {
      name: 'List flags as JSON',
      value: `${packageName} flags ls --json`,
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

export const createSubcommand = {
  name: 'create',
  aliases: ['add'],
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
      description:
        'The type of the flag value (boolean, string, number, or json)',
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
    {
      name: 'variant',
      shorthand: 'v',
      type: [String],
      deprecated: false,
      description:
        'Variant definition as VALUE[=LABEL] (can be repeated for string, number, and json flags)',
      argument: 'VALUE[=LABEL]',
    },
  ],
  examples: [
    {
      name: 'Create a boolean feature flag',
      value: `${packageName} flags create my-feature`,
    },
    {
      name: 'Create a string feature flag with description',
      value: `${packageName} flags create my-feature --kind string --description "My feature flag"`,
    },
    {
      name: 'Create a string feature flag with explicit variants',
      value: `${packageName} flags add my-feature --kind string --variant control="Welcome back" --variant treatment="New onboarding"`,
    },
    {
      name: 'Create a JSON feature flag with explicit variants',
      value: `${packageName} flags add layout-config --kind json --variant '{"theme":"light"}'=Light --variant '{"theme":"dark","sidebar":true}'=Dark`,
    },
  ],
} as const;

export const openSubcommand = {
  name: 'open',
  aliases: [],
  description: 'Open feature flags in the Vercel dashboard',
  arguments: [
    {
      name: 'flag',
      required: false,
    },
  ],
  options: [],
  examples: [
    {
      name: 'Open the project feature flags dashboard',
      value: `${packageName} flags open`,
    },
    {
      name: 'Open a specific feature flag',
      value: `${packageName} flags open my-feature-flag`,
    },
  ],
} as const;

export const updateSubcommand = {
  name: 'update',
  aliases: [],
  description: 'Update an existing feature flag',
  arguments: [
    {
      name: 'flag',
      required: true,
    },
  ],
  options: [
    {
      name: 'variant',
      shorthand: 'v',
      type: String,
      deprecated: false,
      description: 'Variant ID or value to update',
      argument: 'VARIANT',
    },
    {
      name: 'value',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'New variant value',
      argument: 'VALUE',
    },
    {
      name: 'label',
      shorthand: 'l',
      type: String,
      deprecated: false,
      description: 'New variant label',
      argument: 'LABEL',
    },
    {
      name: 'message',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Optional revision message for the update',
      argument: 'TEXT',
    },
  ],
  examples: [
    {
      name: 'Update a string variant value and label',
      value: `${packageName} flags update my-feature --variant control --value welcome-back --label "Welcome back"`,
    },
    {
      name: 'Update a variant with a revision message',
      value: `${packageName} flags update my-feature --variant control --label "Control" --message "Rename control variant"`,
    },
    {
      name: 'Rename a boolean variant label',
      value: `${packageName} flags update my-feature --variant false --label "Disabled"`,
    },
  ],
} as const;

export const setSubcommand = {
  name: 'set',
  aliases: [],
  description: 'Set the served variant for a feature flag in an environment',
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
        'The environment to set the variant in (production, preview, or development)',
      argument: 'ENV',
    },
    {
      name: 'variant',
      shorthand: 'v',
      type: String,
      deprecated: false,
      description: 'The variant ID or value to serve',
      argument: 'VARIANT',
    },
    {
      name: 'message',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Optional revision message for the update',
      argument: 'TEXT',
    },
  ],
  examples: [
    {
      name: 'Set a string variant in production',
      value: `${packageName} flags set welcome-message --environment production --variant control`,
    },
    {
      name: 'Set a number variant in preview',
      value: `${packageName} flags set bucket-size -e preview --variant 20`,
    },
    {
      name: 'Set a boolean flag to true in development',
      value: `${packageName} flags set my-feature -e development --variant true`,
    },
  ],
} as const;

export const splitSubcommand = {
  name: 'split',
  aliases: [],
  description:
    'Configure a weighted split for a feature flag in an environment',
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
        'The environment to configure (production, preview, or development)',
      argument: 'ENV',
    },
    {
      name: 'by',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Entity attribute used for bucketing, in the form entity.attribute',
      argument: 'ENTITY.ATTRIBUTE',
    },
    {
      name: 'weight',
      shorthand: 'w',
      type: [String],
      deprecated: false,
      description:
        'Variant weight ratio as VARIANT=WEIGHT. Repeat for each variant; values are normalized and 0 receives no traffic.',
      argument: 'VARIANT=WEIGHT',
    },
    {
      name: 'default-variant',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'The fallback variant to serve when the split attribute is unavailable',
      argument: 'VARIANT',
    },
    {
      name: 'message',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Optional revision message for the update',
      argument: 'TEXT',
    },
  ],
  examples: [
    {
      name: 'Split a boolean flag in production',
      value: `${packageName} flags split redesigned-checkout --environment production --by user.userId --weight off=95 --weight on=5`,
    },
    {
      name: 'Split a string flag with a fallback variant',
      value: `${packageName} flags split welcome-message -e production --by user.userId --default-variant control --weight control=90 --weight treatment=10`,
    },
    {
      name: 'Exclude a variant from the split',
      value: `${packageName} flags split checkout-copy -e preview --by user.userId --default-variant control --weight control=50 --weight treatment=50 --weight legacy=0`,
    },
  ],
} as const;

export const rolloutSubcommand = {
  name: 'rollout',
  aliases: [],
  description:
    'Configure a progressive rollout for a feature flag in an environment',
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
        'The environment to configure (production, preview, or development)',
      argument: 'ENV',
    },
    {
      name: 'from-variant',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'The variant to roll away from (defaults to false for boolean flags)',
      argument: 'VARIANT',
    },
    {
      name: 'to-variant',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'The variant to roll towards (defaults to true for boolean flags)',
      argument: 'VARIANT',
    },
    {
      name: 'default-variant',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'The fallback variant to serve when the rollout attribute is unavailable',
      argument: 'VARIANT',
    },
    {
      name: 'by',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Entity attribute used for bucketing, in the form entity.attribute',
      argument: 'ENTITY.ATTRIBUTE',
    },
    {
      name: 'stage',
      shorthand: 's',
      type: [String],
      deprecated: false,
      description:
        'Add a rollout stage as PERCENTAGE,DURATION (e.g. "5,6h"). Can be specified multiple times. 100% is implied at the end.',
      argument: 'PERCENTAGE,DURATION',
    },
    {
      name: 'start',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'When the rollout should start: "now", a future relative time like "1h", or an ISO 8601 datetime',
      argument: 'TIME',
    },
    {
      name: 'message',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Optional revision message for the update',
      argument: 'TEXT',
    },
  ],
  examples: [
    {
      name: 'Start a progressive boolean rollout in production',
      value: `${packageName} flags rollout redesigned-checkout --environment production --by user.userId --stage 5,6h --stage 10,6h --stage 25,12h --stage 50,1d`,
    },
    {
      name: 'Schedule a string-flag rollout for later',
      value: `${packageName} flags rollout welcome-message -e production --by user.userId --from-variant control --to-variant treatment --default-variant control --stage 10,2h --stage 50,12h --start 2026-04-16T09:00:00Z`,
    },
    {
      name: 'Update only the rollout schedule while keeping current variants',
      value: `${packageName} flags rollout redesigned-checkout -e production --stage 5,30m --stage 25,2h --stage 50,8h`,
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
  description:
    'Shortcut to serve the false variant of a boolean feature flag in an environment',
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
      description:
        'The variant ID or value to serve while the flag is disabled',
      argument: 'VARIANT',
    },
    {
      name: 'message',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Optional revision message for the update',
      argument: 'TEXT',
    },
  ],
  examples: [
    {
      name: 'Disable a flag in production',
      value: `${packageName} flags disable my-feature --environment production`,
    },
    {
      name: 'Disable a flag with a specific variant',
      value: `${packageName} flags disable my-feature -e production --variant false`,
    },
    {
      name: 'Disable a flag with a revision message',
      value: `${packageName} flags disable my-feature -e production --message "Pause rollout in production"`,
    },
  ],
} as const;

export const enableSubcommand = {
  name: 'enable',
  aliases: [],
  description:
    'Shortcut to serve the true variant of a boolean feature flag in an environment',
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
    {
      name: 'message',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Optional revision message for the update',
      argument: 'TEXT',
    },
  ],
  examples: [
    {
      name: 'Enable a flag in production',
      value: `${packageName} flags enable my-feature --environment production`,
    },
    {
      name: 'Enable a flag with a revision message',
      value: `${packageName} flags enable my-feature --environment production --message "Resume production rollout"`,
    },
  ],
} as const;

export const segmentsListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List all feature flag segments for the current project',
  arguments: [],
  options: [
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output in JSON format',
    },
  ],
  examples: [
    {
      name: 'List all segments',
      value: `${packageName} flags segments ls`,
    },
    {
      name: 'List segments as JSON',
      value: `${packageName} flags segments ls --json`,
    },
  ],
} as const;

export const segmentsInspectSubcommand = {
  name: 'inspect',
  aliases: [],
  description: 'Display information about a feature flag segment',
  arguments: [
    {
      name: 'segment',
      required: true,
    },
  ],
  options: [
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output in JSON format',
    },
  ],
  examples: [
    {
      name: 'Show details of a segment',
      value: `${packageName} flags segments inspect beta-users`,
    },
    {
      name: 'Show segment data as JSON',
      value: `${packageName} flags segments inspect beta-users --json`,
    },
  ],
} as const;

export const segmentsCreateSubcommand = {
  name: 'create',
  aliases: ['add'],
  description: 'Create a feature flag segment',
  arguments: [
    {
      name: 'slug',
      required: true,
    },
  ],
  options: [
    {
      name: 'label',
      shorthand: 'l',
      type: String,
      deprecated: false,
      description: 'Human-readable label for the segment',
      argument: 'LABEL',
    },
    {
      name: 'description',
      shorthand: 'd',
      type: String,
      deprecated: false,
      description: 'Description of the segment',
      argument: 'TEXT',
    },
    {
      name: 'hint',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Hint describing who belongs in the segment',
      argument: 'TEXT',
    },
    {
      name: 'data',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Full segment data JSON with rules, include, and exclude fields',
      argument: 'JSON',
    },
    {
      name: 'add',
      shorthand: 'a',
      type: [String],
      deprecated: false,
      description: `Add include:ENTITY.ATTRIBUTE=VALUE, exclude:ENTITY.ATTRIBUTE=VALUE, or rule:ENTITY.ATTRIBUTE:OPERATOR:VALUE; repeatable. ${segmentRuleOperatorDescription}`,
      argument: 'TARGET',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output the created segment as JSON',
    },
  ],
  examples: [
    {
      name: 'Create a segment with included users',
      value: `${packageName} flags segments create beta-users --label "Beta users" --add include:user.id=user_123 --add include:user.id=user_456`,
    },
    {
      name: 'Create a segment from rules',
      value: `${packageName} flags segments create enterprise-users --label "Enterprise users" --add rule:user.plan:eq:enterprise`,
    },
    {
      name: 'Create a segment from full JSON data',
      value: `${packageName} flags segments create staff --label Staff --data '{"rules":[],"include":{"user":{"email":[{"value":"me@company.com"}]}},"exclude":{}}'`,
    },
  ],
} as const;

export const segmentsUpdateSubcommand = {
  name: 'update',
  aliases: [],
  description: 'Update a feature flag segment',
  arguments: [
    {
      name: 'segment',
      required: true,
    },
  ],
  options: [
    {
      name: 'label',
      shorthand: 'l',
      type: String,
      deprecated: false,
      description: 'New human-readable label for the segment',
      argument: 'LABEL',
    },
    {
      name: 'description',
      shorthand: 'd',
      type: String,
      deprecated: false,
      description: 'New description for the segment',
      argument: 'TEXT',
    },
    {
      name: 'hint',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'New hint for the segment',
      argument: 'TEXT',
    },
    {
      name: 'data',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Replace the full segment data JSON with rules, include, and exclude fields',
      argument: 'JSON',
    },
    {
      name: 'add',
      shorthand: 'a',
      type: [String],
      deprecated: false,
      description: `Add include:ENTITY.ATTRIBUTE=VALUE, exclude:ENTITY.ATTRIBUTE=VALUE, or rule:ENTITY.ATTRIBUTE:OPERATOR:VALUE; repeatable. ${segmentRuleOperatorDescription}`,
      argument: 'TARGET',
    },
    {
      name: 'remove',
      shorthand: null,
      type: [String],
      deprecated: false,
      description: `Remove include:ENTITY.ATTRIBUTE=VALUE, exclude:ENTITY.ATTRIBUTE=VALUE, rule:ENTITY.ATTRIBUTE:OPERATOR:VALUE, or rule:RULE_ID; repeatable. ${segmentRuleOperatorDescription}`,
      argument: 'TARGET',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output the updated segment as JSON',
    },
  ],
  examples: [
    {
      name: 'Rename a segment',
      value: `${packageName} flags segments update beta-users --label "Early access users"`,
    },
    {
      name: 'Add and remove included users',
      value: `${packageName} flags segments update beta-users --add include:user.id=user_789 --remove include:user.id=user_123`,
    },
    {
      name: 'Add and remove rules',
      value: `${packageName} flags segments update enterprise-users --add rule:user.email:ends-with:@company.com --remove rule:user.plan:eq:pro`,
    },
  ],
} as const;

export const segmentsRemoveSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Delete a feature flag segment',
  arguments: [
    {
      name: 'segment',
      required: true,
    },
  ],
  options: [
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when deleting a segment',
    },
  ],
  examples: [
    {
      name: 'Delete a segment',
      value: `${packageName} flags segments rm beta-users`,
    },
    {
      name: 'Delete without confirmation',
      value: `${packageName} flags segments rm beta-users --yes`,
    },
  ],
} as const;

export const segmentsSubcommand = {
  name: 'segments',
  aliases: [],
  description: 'Manage feature flag segments',
  arguments: [],
  subcommands: [
    segmentsListSubcommand,
    segmentsInspectSubcommand,
    segmentsCreateSubcommand,
    segmentsUpdateSubcommand,
    segmentsRemoveSubcommand,
  ],
  options: [],
  examples: [],
} as const;

// SDK Keys subcommands
export const sdkKeysListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List all SDK keys for the current project',
  arguments: [],
  options: [
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output in JSON format',
    },
  ],
  examples: [
    {
      name: 'List all SDK keys',
      value: `${packageName} flags sdk-keys ls`,
    },
    {
      name: 'List SDK keys as JSON',
      value: `${packageName} flags sdk-keys ls --json`,
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
      value: `${packageName} flags sdk-keys add --type client -e preview --label "Preview App"`,
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

export const prepareSubcommand = {
  name: 'prepare',
  aliases: [],
  description: 'Prepare flag definition fallbacks for the build',
  arguments: [],
  options: [],
  examples: [],
} as const;

export const overrideSubcommand = {
  name: 'override',
  aliases: [],
  description:
    'Encrypt flag overrides into a secure token for the vercel-flag-overrides cookie',
  arguments: [
    {
      name: 'flag=value',
      required: false,
    },
  ],
  options: [
    {
      name: 'expiration',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Expiration time for the encrypted token (default: 1y)',
      argument: 'TIME',
    },
    {
      name: 'decrypt',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Decrypt an encrypted override token and print the JSON',
      argument: 'TOKEN',
    },
  ],
  examples: [
    {
      name: 'Encrypt a single flag override',
      value: `${packageName} flags override my-flag=true`,
    },
    {
      name: 'Encrypt multiple flag overrides',
      value: `${packageName} flags override flag-a=true flag-b=hello`,
    },
    {
      name: 'Set a custom expiration',
      value: `${packageName} flags override my-flag=42 --expiration 30d`,
    },
    {
      name: 'Decrypt an override token',
      value: `${packageName} flags override --decrypt <token>`,
    },
  ],
} as const;

export const flagsCommand = {
  name: 'flags',
  aliases: [],
  description: 'Manage feature flags for a Vercel project',
  arguments: [],
  subcommands: [
    listSubcommand,
    inspectSubcommand,
    createSubcommand,
    openSubcommand,
    updateSubcommand,
    setSubcommand,
    splitSubcommand,
    rolloutSubcommand,
    removeSubcommand,
    archiveSubcommand,
    disableSubcommand,
    enableSubcommand,
    segmentsSubcommand,
    sdkKeysSubcommand,
    prepareSubcommand,
    overrideSubcommand,
  ],
  options: [],
  examples: [],
} as const;
