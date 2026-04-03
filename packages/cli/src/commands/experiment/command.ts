import { packageName } from '../../util/pkg-name';

export const experimentMetricsAddSubcommand = {
  name: 'add',
  aliases: ['create'],
  description:
    'Append a metric to an existing experiment on a flag (PATCH flag experiment)',
  arguments: [],
  options: [
    {
      name: 'flag',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Feature flag slug whose experiment receives this metric',
      argument: 'SLUG',
    },
    {
      name: 'name',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Human-readable metric name',
      argument: 'TEXT',
    },
    {
      name: 'metric-type',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'percentage, currency, or count',
      argument: 'TYPE',
    },
    {
      name: 'metric-unit',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'user, session, or visitor',
      argument: 'UNIT',
    },
    {
      name: 'directionality',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'increaseIsGood or decreaseIsGood',
      argument: 'DIR',
    },
    {
      name: 'description',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Optional description',
      argument: 'TEXT',
    },
    {
      name: 'metric-formula',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Optional formula for computed metrics',
      argument: 'EXPR',
    },
    {
      name: 'guardrail',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Add as a guardrail metric (max 2) instead of primary (max 3)',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output created metric as JSON',
    },
  ],
  examples: [
    {
      name: 'Add a primary metric to a draft experiment',
      value: `${packageName} experiment metrics add --flag my-exp --name "Signup Completed" --metric-type count --metric-unit user --directionality increaseIsGood`,
    },
  ],
} as const;

export const experimentMetricsListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List primary and guardrail metrics for a flag experiment',
  arguments: [
    {
      name: 'flag',
      required: true,
    },
  ],
  options: [
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
      name: 'List metrics',
      value: `${packageName} experiment metrics ls my-exp-flag`,
    },
  ],
} as const;

export const experimentMetricsSubcommand = {
  name: 'metrics',
  aliases: [],
  description: 'Create and list experiment metrics',
  arguments: [],
  subcommands: [
    experimentMetricsAddSubcommand,
    experimentMetricsListSubcommand,
  ],
  options: [],
  examples: [],
} as const;

export const experimentCreateSubcommand = {
  name: 'create',
  aliases: [],
  description:
    'Create a draft experiment flag (JSON kind) with a 50/50 split in production',
  arguments: [
    {
      name: 'slug',
      required: true,
    },
  ],
  options: [
    {
      name: 'metric',
      shorthand: null,
      type: [String],
      deprecated: false,
      description:
        'Primary metric as JSON per API Metric schema (1–3, repeatable): name, metricType, metricUnit, directionality; optional description, metricFormula',
      argument: 'JSON',
    },
    {
      name: 'allocation-unit',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'cookieId, visitorId, or userId',
      argument: 'UNIT',
    },
    {
      name: 'hypothesis',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Experiment hypothesis text',
      argument: 'TEXT',
    },
    {
      name: 'name',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Human-readable experiment name',
      argument: 'TEXT',
    },
    {
      name: 'control-variant',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Control variant id (default: control)',
      argument: 'ID',
    },
    {
      name: 'control-value',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'JSON value for the control variant (default includes unitType, experimentId, variantId, isControl, params)',
      argument: 'JSON',
    },
    {
      name: 'treatment-variant',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Treatment variant id (default: treatment)',
      argument: 'ID',
    },
    {
      name: 'treatment-value',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'JSON value for the treatment variant (default includes unitType, experimentId, variantId, isControl, params)',
      argument: 'JSON',
    },
    {
      name: 'seed',
      shorthand: null,
      type: String,
      deprecated: false,
      description: 'Flag seed 0–100000 (default: random)',
      argument: 'N',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output created flag as JSON',
    },
  ],
  examples: [
    {
      name: 'Create draft experiment',
      value: `${packageName} experiment create new-signup-flow --metric '{"name":"Signup","metricType":"count","metricUnit":"user","directionality":"increaseIsGood"}' --allocation-unit visitorId --hypothesis "Streamlined signup converts better"`,
    },
    {
      name: 'Create with custom JSON variant values',
      value: `${packageName} experiment create new-signup-flow --metric '{"name":"Signup","metricType":"count","metricUnit":"user","directionality":"increaseIsGood"}' --control-value '{"unitType":"visitorId","experimentId":"e1","variantId":"v0","isControl":true,"params":{"showBanner":false}}' --treatment-value '{"unitType":"visitorId","experimentId":"e1","variantId":"v1","isControl":false,"params":{"showBanner":true}}'`,
    },
  ],
} as const;

export const experimentListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List flags that have experiment configuration',
  arguments: [],
  options: [
    {
      name: 'state',
      shorthand: 's',
      type: String,
      deprecated: false,
      description: 'Filter by flag state (active or archived)',
      argument: 'STATE',
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
      name: 'List experiments',
      value: `${packageName} experiment list`,
    },
  ],
} as const;

export const experimentStartSubcommand = {
  name: 'start',
  aliases: [],
  description: 'Set experiment status to running and startedAt to now',
  arguments: [
    {
      name: 'slug',
      required: true,
    },
  ],
  options: [
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output updated flag as JSON',
    },
  ],
  examples: [
    {
      name: 'Start',
      value: `${packageName} experiment start new-signup-flow`,
    },
  ],
} as const;

export const experimentStopSubcommand = {
  name: 'stop',
  aliases: [],
  description: 'Set experiment status to closed and endedAt to now',
  arguments: [
    {
      name: 'slug',
      required: true,
    },
  ],
  options: [
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output updated flag as JSON',
    },
  ],
  examples: [
    {
      name: 'Stop',
      value: `${packageName} experiment stop new-signup-flow`,
    },
  ],
} as const;

export const experimentAnalyseSubcommand = {
  name: 'analyse',
  aliases: ['analyze'],
  description: 'Fetch experiment results (Web Analytics insights)',
  arguments: [
    {
      name: 'slug',
      required: true,
    },
  ],
  options: [
    {
      name: 'peek',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description:
        'Include partial results while the experiment is still running',
    },
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Output structured JSON (machine-readable)',
    },
    {
      name: 'metric-event-name',
      shorthand: null,
      type: [String],
      deprecated: false,
      description:
        'Metric / event name(s) to measure (repeatable). Use metric slugs from your project.',
      argument: 'NAME',
    },
    {
      name: 'metric-type',
      shorthand: null,
      type: [String],
      deprecated: false,
      description: 'Metric type(s), e.g. conversion or count (repeatable)',
      argument: 'TYPE',
    },
    {
      name: 'unit-field',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Field used as the experimental unit (visitorId, userId, …). Should match allocation.',
      argument: 'FIELD',
    },
  ],
  examples: [
    {
      name: 'Results with default metric settings',
      value: `${packageName} experiment analyse my-flag --metric-event-name signup-completed --metric-type conversion --unit-field visitorId`,
    },
    {
      name: 'Peek at in-flight results',
      value: `${packageName} experiment analyse my-flag --peek --metric-event-name signup-completed --metric-type conversion --unit-field visitorId`,
    },
    {
      name: 'JSON for scripts and agents',
      value: `${packageName} experiment analyse my-flag --json --metric-event-name signup-completed --metric-type conversion --unit-field visitorId`,
    },
  ],
} as const;

export const experimentCommand = {
  name: 'experiment',
  aliases: [],
  description:
    'Manage feature-flag experiments: metrics, draft flags, start/stop, and results',
  hidden: true,
  arguments: [],
  subcommands: [
    experimentCreateSubcommand,
    experimentListSubcommand,
    experimentStartSubcommand,
    experimentStopSubcommand,
    experimentAnalyseSubcommand,
    experimentMetricsSubcommand,
  ],
  options: [],
  examples: [],
} as const;
