import {
  jsonOption,
  projectOption,
  sinceOption,
  untilOption,
  yesOption,
} from '../../util/arg-common';
import {
  formatFlagAttributeTypeList,
  TIMESTAMP_IDENTIFY_HELP,
} from '../../util/flags/attribute-types';
import { formatFlagConditionComparatorList } from '../../util/flags/comparators';
import { packageName } from '../../util/pkg-name';
import {
  FLAG_EVALUATIONS_DIMENSION_NAMES,
  FLAG_EVALUATIONS_GRANULARITIES,
} from './evaluations-config';

const staticValueModeNote = {
  title: 'Notes',
  body: [
    'Puts the environment in static value mode: every request receives the chosen variant. Existing splits, rollouts, rules, and targets are kept but not evaluated.',
    'Run `flags targeting enable <flag>` to switch the environment back to targets and rules. Run `flags inspect <flag>` first to see what each environment serves today.',
  ],
} as const;

const segmentRuleOperatorDescription = `Valid operators: ${formatFlagConditionComparatorList()}. Timestamp attributes only accept gt (after), gte (at-or-after), lt (before), and lte (at-or-before) with an ISO 8601 date and time (for example 2026-04-16T09:00:00Z) or epoch milliseconds. gt and lt are exclusive; use gte or lte for inclusive boundaries. Date/times without a timezone use this machine's timezone. ${TIMESTAMP_IDENTIFY_HELP}`;

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description:
    'List active feature flags for the current project (use --state archived for archived ones)',
  default: true,
  arguments: [],
  options: [
    projectOption,
    {
      name: 'state',
      shorthand: null,
      deprecatedShorthand: 's',
      type: String,
      deprecated: false,
      description:
        'Filter flags by state: active or archived (default: active)',
      argument: 'STATE',
    },
    {
      name: 'tag',
      shorthand: null,
      type: [String],
      deprecated: false,
      description: 'Filter flags by tag (repeatable; all must match)',
      argument: 'TAG',
    },
    {
      name: 'created-by',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Filter flags by the id of the user or team that created them',
      argument: 'ID',
    },
    {
      name: 'maintainer',
      shorthand: null,
      type: [String],
      deprecated: false,
      description:
        'Filter flags by maintainer user id (repeatable; any may match)',
      argument: 'MAINTAINER',
    },
    // Hidden: `--maintainer-id` is the old name of `--maintainer`.
    {
      name: 'maintainer-id',
      shorthand: null,
      type: [String],
      deprecated: true,
      description: 'Deprecated alias for `--maintainer`',
      argument: 'ID',
    },
    {
      name: 'limit',
      shorthand: 'n',
      type: Number,
      deprecated: false,
      description:
        'Return a single page of at most NUMBER flags (1-100) instead of all',
      argument: 'NUMBER',
    },
    {
      name: 'next',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Show the next page using the cursor from the previous output',
      argument: 'CURSOR',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output as JSON',
    },
  ],
  examples: [
    {
      name: 'List all active flags',
      value: `${packageName} flags list`,
    },
    {
      name: 'List archived flags',
      value: `${packageName} flags list --state archived`,
    },
    {
      name: 'Filter flags by tag, creator, and maintainer',
      value: `${packageName} flags list --tag checkout --created-by user_123 --maintainer user_456`,
    },
    {
      name: 'List the first page of 10 flags',
      value: `${packageName} flags list --limit 10`,
    },
    {
      name: 'List the next page using the cursor from the previous page',
      placeholders: ['<CURSOR>'],
      value: `${packageName} flags list --limit 10 --next <CURSOR>`,
    },
    {
      name: 'List flags as JSON',
      value: `${packageName} flags list --json`,
    },
  ],
} as const;

export const staleSubcommand = {
  name: 'stale',
  aliases: [],
  description: 'List stale feature flags for the current project',
  hidden: true,
  arguments: [],
  options: [
    projectOption,
    {
      name: 'stale-after',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Consider flags stale after this relative day duration (default: 30d, max: 90d)',
      argument: 'DURATION',
    },
    {
      name: 'limit',
      shorthand: 'n',
      type: Number,
      deprecated: false,
      description:
        'Return one page of at most NUMBER stale flags (default: 50, max: 100)',
      argument: 'NUMBER',
    },
    {
      name: 'next',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Show the next page using the cursor from the previous output',
      argument: 'CURSOR',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output as JSON',
    },
  ],
  examples: [
    {
      name: 'List stale flags',
      value: `${packageName} flags stale`,
    },
    {
      name: 'List flags that have been stale for 14 days',
      value: `${packageName} flags stale --stale-after 14d`,
    },
    {
      name: 'List the next page using the cursor from the previous page',
      placeholders: ['<CURSOR>'],
      value: `${packageName} flags stale --limit 10 --next <CURSOR>`,
    },
    {
      name: 'List stale flags as JSON',
      value: `${packageName} flags stale --json`,
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
  options: [projectOption, jsonOption],
  examples: [
    {
      name: 'Show details of a feature flag',
      value: `${packageName} flags inspect my-feature-flag`,
    },
    {
      name: 'Show flag data as JSON',
      value: `${packageName} flags inspect my-feature-flag --json`,
    },
  ],
} as const;

export const versionsListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  default: true,
  description: 'List version history for a feature flag',
  arguments: [
    {
      name: 'flag',
      required: true,
    },
  ],
  options: [
    projectOption,
    {
      name: 'environment',
      shorthand: 'e',
      type: String,
      deprecated: false,
      description: 'Filter versions by changed environment',
      argument: 'ENVIRONMENT',
    },
    {
      name: 'limit',
      shorthand: 'n',
      type: Number,
      deprecated: false,
      description: 'Return at most NUMBER versions (1-100)',
      argument: 'NUMBER',
    },
    {
      name: 'next',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Show the next page using the cursor from the previous output',
      argument: 'CURSOR',
    },
    {
      name: 'cursor',
      shorthand: null,
      type: String,
      deprecated: true,
      description: 'Pagination cursor from a previous versions response',
      argument: 'CURSOR',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output as JSON',
    },
  ],
  examples: [
    {
      name: 'List version history for a feature flag',
      value: `${packageName} flags versions my-feature-flag`,
    },
    {
      name: 'List version history using the explicit list subcommand',
      value: `${packageName} flags versions list my-feature-flag`,
    },
    {
      name: 'List production version history',
      value: `${packageName} flags versions my-feature-flag --environment production`,
    },
    {
      name: 'List the next page of version history',
      placeholders: ['<CURSOR>'],
      value: `${packageName} flags versions my-feature-flag --limit 10 --next <CURSOR>`,
    },
    {
      name: 'List version history as JSON',
      value: `${packageName} flags versions my-feature-flag --json`,
    },
  ],
} as const;

export const versionsDiffSubcommand = {
  name: 'diff',
  aliases: [],
  description: 'Show changes introduced by a feature flag version',
  arguments: [
    {
      name: 'flag',
      required: true,
    },
  ],
  options: [
    projectOption,
    {
      name: 'revision',
      shorthand: null,
      type: Number,
      deprecated: false,
      description: 'Revision number to compare with the previous revision',
      argument: 'NUMBER',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output the diff in JSON format',
    },
  ],
  examples: [
    {
      name: 'Show what changed in a revision',
      value: `${packageName} flags versions diff my-feature-flag --revision 4`,
    },
    {
      name: 'Show the revision diff as JSON',
      value: `${packageName} flags versions diff my-feature-flag --revision 4 --json`,
    },
  ],
} as const;

export const versionsSubcommand = {
  name: 'versions',
  aliases: [],
  description: 'List and compare version history for a feature flag',
  arguments: [],
  subcommands: [versionsListSubcommand, versionsDiffSubcommand],
  options: [],
  examples: [
    {
      name: 'List version history for a feature flag',
      value: `${packageName} flags versions my-feature-flag`,
    },
    {
      name: 'Show what changed in a revision',
      value: `${packageName} flags versions diff my-feature-flag --revision 4`,
    },
  ],
} as const;

export const evaluationsSubcommand = {
  name: 'evaluations',
  aliases: [],
  description:
    'Display evaluation metrics for a feature flag, or for every flag in the project when no flag is given',
  arguments: [
    {
      name: 'flag',
      required: false,
    },
  ],
  options: [
    projectOption,
    {
      ...sinceOption,
      description: `${sinceOption.description} (default: 1h ago)`,
    },
    untilOption,
    {
      name: 'granularity',
      shorthand: null,
      deprecatedShorthand: 'g',
      type: String,
      deprecated: false,
      description: `Time bucket size: ${FLAG_EVALUATIONS_GRANULARITIES.join(', ')} (default: auto)`,
      argument: 'SIZE',
    },
    {
      name: 'group-by',
      shorthand: null,
      type: [String],
      deprecated: false,
      description: `Dimensions to group by (repeatable): ${FLAG_EVALUATIONS_DIMENSION_NAMES.join(', ')} (default: variant for one flag, flag for the whole project). Deleted SDK keys are shown as their hash`,
      argument: 'DIM',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output as JSON',
    },
  ],
  examples: [
    {
      name: 'Show evaluations by variant for the last hour',
      value: `${packageName} flags evaluations my-feature`,
    },
    {
      name: 'Show evaluation metrics as JSON',
      value: `${packageName} flags evaluations my-feature --since 24h --json`,
    },
    {
      name: 'Show which SDK keys and services evaluate a flag',
      value: `${packageName} flags evaluations my-feature --group-by sdk-key --group-by client`,
    },
    {
      name: 'Show which SDK keys are used across every flag in the project',
      value: `${packageName} flags evaluations --group-by sdk-key --since 24h`,
    },
    {
      name: 'Check that every client picked up the latest flag change',
      value: `${packageName} flags evaluations my-feature --group-by datafile-revision --group-by client`,
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
    projectOption,
    {
      name: 'kind',
      shorthand: null,
      deprecatedShorthand: 'k',
      type: String,
      deprecated: false,
      description:
        'The type of the flag value (boolean, string, number, or json)',
      argument: 'KIND',
    },
    {
      name: 'description',
      shorthand: null,
      deprecatedShorthand: 'd',
      type: String,
      deprecated: false,
      description: 'Description of the feature flag',
      argument: 'TEXT',
    },
    {
      name: 'variant',
      shorthand: null,
      deprecatedShorthand: 'v',
      type: [String],
      deprecated: false,
      description:
        'Variant definition as VALUE[=LABEL] (can be repeated for string, number, and json flags)',
      argument: 'VALUE[=LABEL]',
    },
    {
      name: 'default-variant',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Variant ID or value to serve in every environment. Without it, every environment serves the first variant; boolean flags serve Off, and On in development',
      argument: 'VARIANT',
    },
    {
      name: 'environment-variant',
      shorthand: null,
      type: [String],
      deprecated: false,
      description:
        'Variant ID or value to serve in one environment as ENVIRONMENT=VARIANT; repeatable, overrides --default-variant',
      argument: 'ENVIRONMENT=VARIANT',
    },
  ],
  examples: [
    {
      name: 'Create a boolean feature flag',
      value: `${packageName} flags create my-feature`,
    },
    {
      name: 'Create a boolean feature flag that is Off in every environment',
      value: `${packageName} flags create my-feature --default-variant false`,
    },
    {
      name: 'Create a boolean feature flag that is On only in preview',
      value: `${packageName} flags create my-feature --default-variant false --environment-variant preview=true`,
    },
    {
      name: 'Create a string feature flag with description',
      value: `${packageName} flags create my-feature --kind string --description "My feature flag"`,
    },
    {
      name: 'Create a string feature flag with explicit variants',
      value: `${packageName} flags create my-feature --kind string --variant control="Welcome back" --variant treatment="New onboarding"`,
    },
    {
      name: 'Create a JSON feature flag with explicit variants',
      value: `${packageName} flags create layout-config --kind json --variant '{"theme":"light"}'=Light --variant '{"theme":"dark","sidebar":true}'=Dark`,
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
  options: [projectOption],
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
    projectOption,
    {
      name: 'variant',
      shorthand: null,
      deprecatedShorthand: 'v',
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
      shorthand: null,
      deprecatedShorthand: 'l',
      type: String,
      deprecated: false,
      description: 'New variant label',
      argument: 'LABEL',
    },
    {
      name: 'add-variant',
      shorthand: null,
      type: [String],
      deprecated: false,
      description:
        'Add a variant as VALUE[=LABEL] (repeatable for string, number, and json flags)',
      argument: 'VALUE[=LABEL]',
    },
    {
      name: 'remove-variant',
      shorthand: null,
      type: [String],
      deprecated: false,
      description: 'Remove a variant by ID or value (repeatable)',
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
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when removing a variant',
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
    {
      name: 'Add a new variant',
      value: `${packageName} flags update my-feature --add-variant treatment="New onboarding"`,
    },
    {
      name: 'Remove variants by value or ID',
      value: `${packageName} flags update my-feature --remove-variant control --remove-variant var_123 --yes`,
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
    projectOption,
    {
      name: 'environment',
      shorthand: 'e',
      type: String,
      deprecated: false,
      description:
        'The environment to set the variant in (production, preview, or development)',
      argument: 'ENVIRONMENT',
    },
    {
      name: 'variant',
      shorthand: null,
      deprecatedShorthand: 'v',
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
  helpSections: [
    {
      title: 'Notes',
      body: [
        'Puts the environment in static value mode. The existing default variant, split or rollout, rules, and targets are preserved but not evaluated.',
        `Run \`${packageName} flags targeting enable <FLAG>\` to resume targeting with the saved configuration.`,
      ],
    },
  ],
} as const;

export const targetingEnableSubcommand = {
  name: 'enable',
  aliases: [],
  description:
    'Enable targeting for a feature flag environment; keeps the current fallthrough unless --default-variant is set',
  arguments: [
    {
      name: 'flag',
      required: true,
    },
  ],
  options: [
    projectOption,
    {
      name: 'environment',
      shorthand: 'e',
      type: String,
      deprecated: false,
      description:
        'The environment to enable targeting in (production, preview, or development)',
      argument: 'ENVIRONMENT',
    },
    {
      name: 'default-variant',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Replace the fallthrough with this variant when no targeting rules match',
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
      name: 'Enable targeting and keep the current fallthrough',
      value: `${packageName} flags targeting enable my-feature --environment production`,
    },
    {
      name: 'Enable targeting with a static default Off',
      value: `${packageName} flags targeting enable my-feature --environment production --default-variant false`,
    },
    {
      name: 'Enable targeting with a string default',
      value: `${packageName} flags targeting enable welcome-message -e production --default-variant control`,
    },
  ],
} as const;

export const targetingSubcommand = {
  name: 'targeting',
  aliases: [],
  description: 'Manage targeting for a feature flag environment',
  arguments: [],
  subcommands: [targetingEnableSubcommand],
  options: [],
  examples: [
    {
      name: 'Enable targeting and keep the current fallthrough',
      value: `${packageName} flags targeting enable my-feature --environment production`,
    },
  ],
} as const;

/** Hidden: `flags use-targeting` is the old name of `flags targeting enable`. */
export const useTargetingSubcommand = {
  ...targetingEnableSubcommand,
  name: 'use-targeting',
  hidden: true,
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
    projectOption,
    {
      name: 'environment',
      shorthand: 'e',
      type: String,
      deprecated: false,
      description:
        'The environment to configure (production, preview, or development)',
      argument: 'ENVIRONMENT',
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
      shorthand: null,
      deprecatedShorthand: 'w',
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
      value: `${packageName} flags split redesigned-checkout --environment production --by user.userId --weight false=95 --weight true=5`,
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

const rolloutFinalPercentageOption = {
  name: 'final-percentage',
  shorthand: null,
  type: String,
  deprecated: false,
  description:
    'Percentage served indefinitely after the last stage (0–100, up to 3 decimal places). Preserves the current value when omitted (default: 100 for new rollouts).',
  argument: 'PERCENTAGE',
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
    projectOption,
    {
      name: 'environment',
      shorthand: 'e',
      type: String,
      deprecated: false,
      description:
        'The environment to configure (production, preview, or development)',
      argument: 'ENVIRONMENT',
    },
    {
      name: 'from-variant',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'The variant to roll away from (default: false for boolean flags)',
      argument: 'VARIANT',
    },
    {
      name: 'to-variant',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'The variant to roll towards (default: true for boolean flags)',
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
      shorthand: null,
      deprecatedShorthand: 's',
      type: [String],
      deprecated: false,
      description:
        'Add a rollout stage as PERCENTAGE,DURATION (e.g. "5,6h"). Can be specified multiple times. Ends at --final-percentage (default: 100%).',
      argument: 'PERCENTAGE,DURATION',
    },
    rolloutFinalPercentageOption,
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
      name: 'Finish a rollout at 50%',
      value: `${packageName} flags rollout redesigned-checkout -e production --by user.userId --stage 5,6h --stage 25,12h --final-percentage 50`,
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

const ruleConditionDescription = `Rule condition as ENTITY.ATTRIBUTE:OPERATOR:VALUE or segment:OPERATOR:SEGMENT. Repeatable; semicolon-separated conditions are also supported. ${segmentRuleOperatorDescription}`;

const ruleOutcomeOptions = [
  {
    name: 'variant',
    shorthand: null,
    deprecatedShorthand: 'v',
    type: String,
    deprecated: false,
    description: 'Variant ID or value to serve when the rule matches',
    argument: 'VARIANT',
  },
  {
    name: 'by',
    shorthand: null,
    type: String,
    deprecated: false,
    description:
      'Entity attribute used for split or rollout bucketing, in the form entity.attribute',
    argument: 'ENTITY.ATTRIBUTE',
  },
  {
    name: 'weight',
    shorthand: null,
    deprecatedShorthand: 'w',
    type: [String],
    deprecated: false,
    description:
      'Split weight ratio as VARIANT=WEIGHT. Repeat for each variant.',
    argument: 'VARIANT=WEIGHT',
  },
  {
    name: 'default-variant',
    shorthand: null,
    type: String,
    deprecated: false,
    description:
      'Fallback variant for split or rollout outcomes when the bucketing attribute is unavailable',
    argument: 'VARIANT',
  },
  {
    name: 'from-variant',
    shorthand: null,
    type: String,
    deprecated: false,
    description: 'Variant to roll away from for rollout outcomes',
    argument: 'VARIANT',
  },
  {
    name: 'to-variant',
    shorthand: null,
    type: String,
    deprecated: false,
    description: 'Variant to roll towards for rollout outcomes',
    argument: 'VARIANT',
  },
  {
    name: 'stage',
    shorthand: null,
    deprecatedShorthand: 's',
    type: [String],
    deprecated: false,
    description:
      'Add a rollout stage as PERCENTAGE,DURATION. Can be specified multiple times.',
    argument: 'PERCENTAGE,DURATION',
  },
  rolloutFinalPercentageOption,
  {
    name: 'start',
    shorthand: null,
    type: String,
    deprecated: false,
    description:
      'When the rollout should start: "now", a relative time like "1h", or an ISO 8601 datetime',
    argument: 'TIME',
  },
] as const;

const ruleMessageOption = {
  name: 'message',
  shorthand: null,
  type: String,
  deprecated: false,
  description: 'Optional revision message for the update',
  argument: 'TEXT',
} as const;

export const rulesListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List conditional rules for a feature flag environment',
  arguments: [
    {
      name: 'flag',
      required: true,
    },
  ],
  options: [
    projectOption,
    {
      name: 'environment',
      shorthand: 'e',
      type: String,
      deprecated: false,
      description:
        'The environment to list rules for (production, preview, or development)',
      argument: 'ENVIRONMENT',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output as JSON',
    },
  ],
  examples: [
    {
      name: 'List production rules for a flag',
      value: `${packageName} flags rules list my-feature --environment production`,
    },
    {
      name: 'List rules as JSON',
      value: `${packageName} flags rules list my-feature -e production --json`,
    },
  ],
} as const;

export const rulesAddSubcommand = {
  name: 'add',
  aliases: [],
  description: 'Add a conditional rule to a feature flag environment',
  arguments: [
    {
      name: 'flag',
      required: true,
    },
  ],
  options: [
    // `-p` is still the hidden short form of `--position` until the next major.
    { ...projectOption, shorthand: null },
    {
      name: 'environment',
      shorthand: 'e',
      type: String,
      deprecated: false,
      description:
        'The environment to add the rule to (production, preview, or development)',
      argument: 'ENVIRONMENT',
    },
    {
      name: 'condition',
      shorthand: null,
      deprecatedShorthand: 'c',
      type: [String],
      deprecated: false,
      description: ruleConditionDescription,
      argument: 'CONDITION',
    },
    ...ruleOutcomeOptions,
    {
      name: 'position',
      shorthand: null,
      deprecatedShorthand: 'p',
      type: Number,
      deprecated: false,
      description: '1-based position for the new rule (default: last)',
      argument: 'N',
    },
    ruleMessageOption,
  ],
  examples: [
    {
      name: 'Add a variant rule',
      value: `${packageName} flags rules add my-feature --environment production --condition user.plan:eq:pro --variant on`,
    },
    {
      name: 'Add a segment rule',
      value: `${packageName} flags rules add my-feature -e production --condition segment:eq:seg_beta123 --variant on`,
    },
    {
      name: 'Add a rule with a timestamp condition',
      value: `${packageName} flags rules add my-feature -e production --condition user.signupAt:after:2026-04-16T09:00:00Z --variant on`,
    },
    {
      name: 'Add a split rule at the top',
      value: `${packageName} flags rules add my-feature -e production --condition user.plan:eq:pro --by user.userId --weight false=90 --weight true=10 --position 1`,
    },
  ],
} as const;

export const rulesUpdateSubcommand = {
  name: 'update',
  aliases: [],
  description: 'Update a conditional rule in a feature flag environment',
  arguments: [
    {
      name: 'flag',
      required: true,
    },
    {
      name: 'rule',
      required: true,
    },
  ],
  options: [
    projectOption,
    {
      name: 'environment',
      shorthand: 'e',
      type: String,
      deprecated: false,
      description:
        'The environment containing the rule (production, preview, or development)',
      argument: 'ENVIRONMENT',
    },
    {
      name: 'condition',
      shorthand: null,
      deprecatedShorthand: 'c',
      type: [String],
      deprecated: false,
      description: 'Replace rule conditions. ' + ruleConditionDescription,
      argument: 'CONDITION',
    },
    ...ruleOutcomeOptions,
    ruleMessageOption,
  ],
  examples: [
    {
      name: 'Replace rule conditions',
      value: `${packageName} flags rules update my-feature rule_123 --environment production --condition user.plan:eq:enterprise`,
    },
    {
      name: 'Update a rule outcome',
      value: `${packageName} flags rules update my-feature rule_123 -e production --variant off`,
    },
  ],
} as const;

export const rulesRemoveSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Remove a conditional rule from a feature flag environment',
  arguments: [
    {
      name: 'flag',
      required: true,
    },
    {
      name: 'rule',
      required: true,
    },
  ],
  options: [
    projectOption,
    {
      name: 'environment',
      shorthand: 'e',
      type: String,
      deprecated: false,
      description:
        'The environment containing the rule (production, preview, or development)',
      argument: 'ENVIRONMENT',
    },
    ruleMessageOption,
  ],
  examples: [
    {
      name: 'Remove a rule',
      value: `${packageName} flags rules remove my-feature rule_123 --environment production`,
    },
  ],
} as const;

export const rulesMoveSubcommand = {
  name: 'move',
  aliases: [],
  description: 'Move a conditional rule within a feature flag environment',
  arguments: [
    {
      name: 'flag',
      required: true,
    },
    {
      name: 'rule',
      required: true,
    },
  ],
  options: [
    // `-p` is still the hidden short form of `--position` until the next major.
    { ...projectOption, shorthand: null },
    {
      name: 'environment',
      shorthand: 'e',
      type: String,
      deprecated: false,
      description:
        'The environment containing the rule (production, preview, or development)',
      argument: 'ENVIRONMENT',
    },
    {
      name: 'position',
      shorthand: null,
      deprecatedShorthand: 'p',
      type: Number,
      deprecated: false,
      description: '1-based destination position for the rule',
      argument: 'N',
    },
    ruleMessageOption,
  ],
  examples: [
    {
      name: 'Move a rule to the top',
      value: `${packageName} flags rules move my-feature rule_123 --environment production --position 1`,
    },
  ],
} as const;

export const rulesSubcommand = {
  name: 'rules',
  aliases: [],
  description: 'Manage conditional rules for feature flags',
  arguments: [],
  subcommands: [
    rulesListSubcommand,
    rulesAddSubcommand,
    rulesUpdateSubcommand,
    rulesRemoveSubcommand,
    rulesMoveSubcommand,
  ],
  options: [],
  examples: [],
} as const;

const targetArgument = {
  name: 'entity.attribute=value',
  required: true,
  multiple: true,
} as const;

const targetEnvironmentOption = {
  name: 'environment',
  shorthand: 'e',
  type: String,
  deprecated: false,
  description:
    'The environment to change (production, preview, or development)',
  argument: 'ENVIRONMENT',
} as const;

export const targetsListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List the direct targets of a feature flag environment',
  arguments: [
    {
      name: 'flag',
      required: true,
    },
  ],
  options: [
    projectOption,
    {
      ...targetEnvironmentOption,
      description:
        'The environment to list targets for (production, preview, or development)',
    },
    jsonOption,
  ],
  examples: [
    {
      name: 'List production targets for a flag',
      value: `${packageName} flags targets list my-feature --environment production`,
    },
    {
      name: 'List targets as JSON',
      value: `${packageName} flags targets list my-feature -e production --json`,
    },
  ],
} as const;

export const targetsAddSubcommand = {
  name: 'add',
  aliases: [],
  description:
    'Serve a variant to specific entity values in a feature flag environment. A value already targeted by another variant moves to the new one. Append |LABEL to a value to also set its label.',
  arguments: [
    {
      name: 'flag',
      required: true,
    },
    targetArgument,
  ],
  options: [
    projectOption,
    targetEnvironmentOption,
    {
      name: 'variant',
      shorthand: null,
      deprecatedShorthand: 'v',
      type: String,
      deprecated: false,
      description:
        'Variant ID or value to serve to the targets (default: true for boolean flags)',
      argument: 'VARIANT',
    },
    ruleMessageOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Serve On to two users in production',
      value: `${packageName} flags targets add my-feature --environment production user.id=user_123 user.id=user_456`,
    },
    {
      name: 'Serve a string variant to a team',
      value: `${packageName} flags targets add welcome-message -e preview --variant treatment team.id=team_789`,
    },
    {
      name: 'Add a target and label it in one step',
      value: `${packageName} flags targets add my-feature -e production "team.id=team_789|Vercel"`,
    },
  ],
} as const;

export const targetsRemoveSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Remove direct targets from a feature flag environment',
  arguments: [
    {
      name: 'flag',
      required: true,
    },
    targetArgument,
  ],
  options: [
    projectOption,
    targetEnvironmentOption,
    ruleMessageOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Stop targeting a user in production',
      value: `${packageName} flags targets remove my-feature --environment production user.id=user_123`,
    },
  ],
} as const;

export const targetsSubcommand = {
  name: 'targets',
  aliases: [],
  description:
    'Manage direct targets: entity values that always receive a fixed variant',
  arguments: [],
  subcommands: [
    targetsListSubcommand,
    targetsAddSubcommand,
    targetsRemoveSubcommand,
  ],
  options: [],
  examples: [],
} as const;

export const removeSubcommand = {
  name: 'delete',
  aliases: ['rm', 'del', 'remove'],
  description: 'Delete a feature flag',
  arguments: [
    {
      name: 'flag',
      required: true,
    },
  ],
  options: [
    projectOption,
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when deleting a flag',
    },
  ],
  examples: [
    {
      name: 'Delete a feature flag',
      value: `${packageName} flags delete my-feature-flag`,
    },
    {
      name: 'Delete without confirmation',
      value: `${packageName} flags delete my-feature-flag --yes`,
    },
  ],
  helpSections: [
    {
      title: 'Notes',
      body: [
        'Only archived flags can be deleted. Run `flags archive <flag>` first.',
        'Deletion is permanent. Prefer leaving flags archived; `flags unarchive <flag>` restores an archived flag.',
      ],
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
    projectOption,
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when archiving a flag',
    },
    {
      name: 'message',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Attach a revision message when archiving the flag',
      argument: 'TEXT',
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
    {
      name: 'Archive a flag with a revision message',
      value: `${packageName} flags archive my-feature-flag --message "Removed from code"`,
    },
  ],
  helpSections: [
    {
      title: 'Notes',
      body: [
        'Archived flags evaluate to the default value in code. Remove the flag from your code and deploy to every environment before archiving.',
        'The command reports evaluations from the last 3 days before asking for confirmation. Clients on @vercel/flags-core older than 1.6.0 do not report evaluations, so zero does not prove the flag is unused. For a longer window, run `flags evaluations <flag> --since 30d` (the default is the last hour).',
        '`flags unarchive <flag>` restores the flag with its configuration and history.',
      ],
    },
  ],
} as const;

export const unarchiveSubcommand = {
  name: 'unarchive',
  aliases: [],
  description: 'Unarchive a feature flag',
  arguments: [
    {
      name: 'flag',
      required: true,
    },
  ],
  options: [
    projectOption,
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when unarchiving a flag',
    },
  ],
  examples: [
    {
      name: 'Unarchive a feature flag',
      value: `${packageName} flags unarchive my-feature-flag`,
    },
    {
      name: 'Unarchive without confirmation',
      value: `${packageName} flags unarchive my-feature-flag --yes`,
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
    projectOption,
    {
      name: 'environment',
      shorthand: 'e',
      type: String,
      deprecated: false,
      description:
        'The environment to disable the flag in (production, preview, or development)',
      argument: 'ENVIRONMENT',
    },
    {
      name: 'variant',
      shorthand: null,
      deprecatedShorthand: 'v',
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
  helpSections: [staticValueModeNote],
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
    projectOption,
    {
      name: 'environment',
      shorthand: 'e',
      type: String,
      deprecated: false,
      description:
        'The environment to enable the flag in (production, preview, or development)',
      argument: 'ENVIRONMENT',
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
  helpSections: [staticValueModeNote],
} as const;

export const segmentsListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List all feature flag segments for the current project',
  arguments: [],
  options: [
    projectOption,
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output as JSON',
    },
  ],
  examples: [
    {
      name: 'List all segments',
      value: `${packageName} flags segments list`,
    },
    {
      name: 'List segments as JSON',
      value: `${packageName} flags segments list --json`,
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
    projectOption,
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output as JSON',
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
    projectOption,
    {
      name: 'label',
      shorthand: null,
      deprecatedShorthand: 'l',
      type: String,
      deprecated: false,
      description: 'Human-readable label for the segment',
      argument: 'LABEL',
    },
    {
      name: 'description',
      shorthand: null,
      deprecatedShorthand: 'd',
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
      shorthand: null,
      deprecatedShorthand: 'a',
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
      name: 'Create a segment using a timestamp condition',
      value: `${packageName} flags segments create early-adopters --add rule:user.signupAt:before:2026-04-16T09:00:00Z`,
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
    projectOption,
    {
      name: 'label',
      shorthand: null,
      deprecatedShorthand: 'l',
      type: String,
      deprecated: false,
      description: 'New human-readable label for the segment',
      argument: 'LABEL',
    },
    {
      name: 'description',
      shorthand: null,
      deprecatedShorthand: 'd',
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
      shorthand: null,
      deprecatedShorthand: 'a',
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
    {
      name: 'Add a timestamp condition',
      value: `${packageName} flags segments update early-adopters --add rule:user.signupAt:before:2026-04-16T09:00:00Z`,
    },
  ],
} as const;

export const segmentsRemoveSubcommand = {
  name: 'delete',
  aliases: ['rm', 'del', 'remove'],
  description: 'Delete a feature flag segment',
  arguments: [
    {
      name: 'segment',
      required: true,
    },
  ],
  options: [
    projectOption,
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when deleting a segment',
    },
  ],
  examples: [
    {
      name: 'Delete a segment',
      value: `${packageName} flags segments delete beta-users`,
    },
    {
      name: 'Delete without confirmation',
      value: `${packageName} flags segments delete beta-users --yes`,
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

// Entities subcommands
const attributeTypeDescription = `Valid types: ${formatFlagAttributeTypeList()}`;

export const entitiesListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List the feature flag entities for the current project',
  arguments: [],
  options: [
    projectOption,
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output as JSON',
    },
  ],
  examples: [
    {
      name: 'List all entities',
      value: `${packageName} flags entities list`,
    },
    {
      name: 'List entities as JSON',
      value: `${packageName} flags entities list --json`,
    },
  ],
} as const;

export const entitiesCreateSubcommand = {
  name: 'create',
  aliases: ['add'],
  description: 'Create a feature flag entity',
  arguments: [
    {
      name: 'kind',
      required: true,
    },
  ],
  options: [
    projectOption,
    {
      name: 'label',
      shorthand: null,
      deprecatedShorthand: 'l',
      type: String,
      deprecated: false,
      description: 'Human-readable label for the entity',
      argument: 'LABEL',
    },
    {
      name: 'attribute',
      shorthand: null,
      deprecatedShorthand: 'a',
      type: [String],
      deprecated: false,
      description: `Add an attribute as KEY:TYPE; repeatable. ${attributeTypeDescription}`,
      argument: 'KEY:TYPE',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output the created entity as JSON',
    },
  ],
  examples: [
    {
      name: 'Create a user entity with attributes',
      value: `${packageName} flags entities create user --label User --attribute id:string --attribute plan:string`,
    },
    {
      name: 'Create a team entity with a string array attribute',
      value: `${packageName} flags entities create team --attribute id:string --attribute features:stringArray`,
    },
  ],
} as const;

export const entitiesUpdateSubcommand = {
  name: 'update',
  aliases: [],
  description: 'Update a feature flag entity and its attributes',
  arguments: [
    {
      name: 'kind',
      required: true,
    },
  ],
  options: [
    projectOption,
    {
      name: 'label',
      shorthand: null,
      deprecatedShorthand: 'l',
      type: String,
      deprecated: false,
      description: 'New human-readable label for the entity',
      argument: 'LABEL',
    },
    {
      name: 'add-attribute',
      shorthand: null,
      type: [String],
      deprecated: false,
      description: `Add an attribute as KEY:TYPE; repeatable. ${attributeTypeDescription}`,
      argument: 'KEY:TYPE',
    },
    {
      name: 'remove-attribute',
      shorthand: null,
      type: [String],
      deprecated: false,
      description:
        'Remove an attribute by key; repeatable. Fails when flags or segments still reference it',
      argument: 'KEY',
    },
    {
      name: 'set-attribute-type',
      shorthand: null,
      type: [String],
      deprecated: false,
      description: `Change the type of an attribute as KEY:TYPE; repeatable. Changing the type also removes existing value labels. Fails when flags or segments still reference it. ${attributeTypeDescription}`,
      argument: 'KEY:TYPE',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output the updated entity as JSON',
    },
  ],
  examples: [
    {
      name: 'Change the entity label',
      value: `${packageName} flags entities update user --label "End user"`,
    },
    {
      name: 'Add and remove attributes',
      value: `${packageName} flags entities update user --add-attribute email:string --remove-attribute legacyId`,
    },
    {
      name: 'Change an attribute type',
      value: `${packageName} flags entities update user --set-attribute-type signupAt:timestamp`,
    },
  ],
} as const;

export const entitiesRemoveSubcommand = {
  name: 'delete',
  aliases: ['rm', 'del', 'remove'],
  description:
    'Delete a feature flag entity. Fails when flags or segments still reference it',
  arguments: [
    {
      name: 'kind',
      required: true,
    },
  ],
  options: [
    projectOption,
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when deleting an entity',
    },
  ],
  examples: [
    {
      name: 'Delete an entity',
      value: `${packageName} flags entities delete device`,
    },
    {
      name: 'Delete without confirmation',
      value: `${packageName} flags entities delete device --yes`,
    },
  ],
} as const;

const labelOptions = [
  projectOption,
  {
    name: 'json',
    shorthand: null,
    type: Boolean,
    deprecated: false,
    description: 'Output results and errors as JSON',
  },
] as const;

export const labelsListSubcommand = {
  name: 'ls',
  aliases: ['list'],
  description: 'Discover label lists or list the labels for an attribute',
  arguments: [{ name: 'ENTITY.ATTRIBUTE', required: false }],
  options: [
    ...labelOptions,
    {
      name: 'limit',
      shorthand: 'n',
      type: Number,
      deprecated: false,
      description: 'Return at most NUMBER lists or labels (default: 20)',
      argument: 'NUMBER',
    },
    {
      name: 'next',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Continue from the cursor returned by the previous page',
      argument: 'CURSOR',
    },
  ],
  examples: [
    {
      name: 'Discover label lists',
      value: `${packageName} flags labels ls`,
    },
    {
      name: 'List the first page of plan labels',
      value: `${packageName} flags labels ls user.plan`,
    },
    {
      name: 'Continue listing plan labels',
      placeholders: ['<CURSOR>'],
      value: `${packageName} flags labels ls user.plan --limit 50 --next <CURSOR>`,
    },
  ],
} as const;

export const labelsSetSubcommand = {
  name: 'set',
  aliases: [],
  description: 'Create or replace one attribute value label',
  arguments: [
    { name: 'ENTITY.ATTRIBUTE', required: true },
    { name: 'value', required: true },
    { name: 'label', required: true },
  ],
  options: labelOptions,
  examples: [
    {
      name: 'Label a plan',
      value: `${packageName} flags labels set user.plan pro "Pro Plan"`,
    },
  ],
} as const;

export const labelsRemoveSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description:
    'Remove a value label without changing targeting; ignore missing labels',
  arguments: [
    { name: 'ENTITY.ATTRIBUTE', required: true },
    { name: 'value', required: true },
  ],
  options: labelOptions,
  examples: [
    {
      name: 'Remove a plan label',
      value: `${packageName} flags labels remove user.plan pro`,
    },
  ],
} as const;

export const labelsApplySubcommand = {
  name: 'apply',
  aliases: [],
  description: 'Set and remove multiple attribute value labels',
  arguments: [{ name: 'ENTITY.ATTRIBUTE', required: true }],
  options: [
    ...labelOptions,
    {
      name: 'set',
      shorthand: null,
      type: [String],
      deprecated: false,
      description: 'Create or replace a value label as VALUE=LABEL; repeatable',
      argument: 'VALUE=LABEL',
    },
    {
      name: 'remove',
      shorthand: null,
      type: [String],
      deprecated: false,
      description: 'Remove a value label; repeatable; ignore missing labels',
      argument: 'VALUE',
    },
    {
      name: 'data',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Apply label operations from a JSON array; cannot combine with --set or --remove',
      argument: 'JSON',
    },
  ],
  examples: [
    {
      name: 'Set and remove plan labels',
      value: `${packageName} flags labels apply user.plan --set "pro=Pro Plan" --set "enterprise=Enterprise Plan" --remove legacy`,
    },
    {
      name: 'Apply JSON operations',
      value: `${packageName} flags labels apply user.plan --data '[{"operation":"upsert","value":"id=123","label":"Example"},{"operation":"delete","value":"legacy"}]'`,
    },
  ],
} as const;

export const labelsSubcommand = {
  name: 'labels',
  aliases: [],
  description:
    'Discover label lists and manage labels for string or stringArray attributes',
  arguments: [],
  subcommands: [
    labelsListSubcommand,
    labelsSetSubcommand,
    labelsRemoveSubcommand,
    labelsApplySubcommand,
  ],
  options: [],
  examples: [],
} as const;

export const entitiesSubcommand = {
  name: 'entities',
  aliases: [],
  description: 'Manage the entity schema used for flag targeting',
  arguments: [],
  subcommands: [
    entitiesListSubcommand,
    entitiesCreateSubcommand,
    entitiesUpdateSubcommand,
    entitiesRemoveSubcommand,
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
    projectOption,
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output as JSON',
    },
  ],
  examples: [
    {
      name: 'List all SDK keys',
      value: `${packageName} flags sdk-keys list`,
    },
    {
      name: 'List SDK keys as JSON',
      value: `${packageName} flags sdk-keys list --json`,
    },
  ],
} as const;

export const sdkKeysAddSubcommand = {
  name: 'create',
  aliases: ['add'],
  description: 'Create a new SDK key',
  arguments: [],
  options: [
    projectOption,
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
      argument: 'ENVIRONMENT',
    },
    {
      name: 'label',
      shorthand: null,
      deprecatedShorthand: 'l',
      type: String,
      deprecated: false,
      description: 'Optional label for the SDK key',
      argument: 'LABEL',
    },
  ],
  examples: [
    {
      name: 'Create a server SDK key for production',
      value: `${packageName} flags sdk-keys create --type server --environment production`,
    },
    {
      name: 'Create a client SDK key with a label',
      value: `${packageName} flags sdk-keys create --type client -e preview --label "Preview App"`,
    },
  ],
} as const;

export const sdkKeysRemoveSubcommand = {
  name: 'revoke',
  aliases: ['remove', 'rm'],
  description: 'Revoke an SDK key',
  arguments: [
    {
      name: 'key',
      required: true,
    },
  ],
  options: [
    projectOption,
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when revoking an SDK key',
    },
  ],
  examples: [
    {
      name: 'Revoke an SDK key',
      placeholders: ['<hash-key>'],
      value: `${packageName} flags sdk-keys revoke <hash-key>`,
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

// Connections subcommands
export const connectionsListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description:
    'List the projects connected to the flags of the current project',
  arguments: [],
  options: [
    projectOption,
    {
      name: 'role',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Which side of the connection the current project is on: "source" lists the projects that may read its flags, "consumer" lists the projects whose flags it may read (default: source)',
      argument: 'ROLE',
    },
    jsonOption,
  ],
  examples: [
    {
      name: 'List the projects that may read the flags of the current project',
      value: `${packageName} flags connections list`,
    },
    {
      name: 'List the projects whose flags the current project may read',
      value: `${packageName} flags connections list --role consumer`,
    },
  ],
} as const;

export const connectionsAddSubcommand = {
  name: 'add',
  aliases: [],
  description:
    'Let another project in the team read the flags of the current project',
  arguments: [
    {
      name: 'consumer-project',
      required: true,
    },
  ],
  options: [projectOption],
  examples: [
    {
      name: 'Let project "storefront" read the flags of the current project',
      value: `${packageName} flags connections add storefront`,
    },
    {
      name: 'Let a project read the flags of a specific source project',
      value: `${packageName} flags connections add storefront --project checkout`,
    },
  ],
} as const;

export const connectionsRemoveSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Stop a project from reading the flags of the current project',
  arguments: [
    {
      name: 'consumer-project',
      required: true,
    },
  ],
  options: [
    projectOption,
    {
      ...yesOption,
      description: 'Skip the confirmation prompt when removing a connection',
    },
  ],
  examples: [
    {
      name: 'Stop project "storefront" from reading the flags of the current project',
      value: `${packageName} flags connections remove storefront`,
    },
  ],
} as const;

export const connectionsSubcommand = {
  name: 'connections',
  aliases: [],
  description:
    'Manage which projects in the team may read the flags of a project',
  // Not released yet; works when invoked, kept out of `flags --help`.
  hidden: true,
  arguments: [],
  subcommands: [
    connectionsListSubcommand,
    connectionsAddSubcommand,
    connectionsRemoveSubcommand,
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

export const datafileSubcommand = {
  name: 'datafile',
  aliases: [],
  description: 'Display the datafile of the project',
  arguments: [],
  options: [
    projectOption,
    {
      name: 'environment',
      shorthand: 'e',
      type: String,
      deprecated: false,
      description:
        'The environment to load the datafile for (production, preview, or development). Not supported with --sdk-key, as SDK keys are bound to an environment',
      argument: 'ENVIRONMENT',
    },
    {
      name: 'sdk-key',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Authenticate with an SDK key instead of user or development OIDC credentials. The key is read from stdin, or from a masked prompt in a terminal',
    },
    jsonOption,
  ],
  examples: [
    {
      name: 'Display the datafile of the linked project',
      value: `${packageName} flags datafile`,
    },
    {
      name: 'Display the production datafile of a specific project',
      value: `${packageName} flags datafile --project my-project --environment production`,
    },
    {
      name: 'Display the datafile for an SDK key read from stdin',
      value: `${packageName} flags datafile --sdk-key < sdk-key.txt`,
    },
    {
      name: 'Display the datafile as JSON',
      value: `${packageName} flags datafile --json`,
    },
  ],
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
      placeholders: ['<token>'],
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
    staleSubcommand,
    inspectSubcommand,
    versionsSubcommand,
    evaluationsSubcommand,
    createSubcommand,
    openSubcommand,
    updateSubcommand,
    setSubcommand,
    targetingSubcommand,
    useTargetingSubcommand,
    splitSubcommand,
    rolloutSubcommand,
    removeSubcommand,
    archiveSubcommand,
    unarchiveSubcommand,
    disableSubcommand,
    enableSubcommand,
    rulesSubcommand,
    targetsSubcommand,
    segmentsSubcommand,
    entitiesSubcommand,
    labelsSubcommand,
    sdkKeysSubcommand,
    connectionsSubcommand,
    prepareSubcommand,
    datafileSubcommand,
    overrideSubcommand,
  ],
  options: [],
  examples: [],
} as const;
