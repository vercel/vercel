import type Client from '../../../util/client';
import output from '../../../output-manager';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import { validateJsonOutput } from '../../../util/output-format';
import formatTable from '../../../util/format-table';
import indent from '../../../util/output/indent';
import getScope from '../../../util/get-scope';
import { fetchMetricDetailOrExit } from '../../metrics/schema-api';
import { formatErrorJson } from '../../metrics/output';
import { formatMetricsTable } from '../../metrics/schema-format';
import type { MetricDetail } from '../../metrics/types';
import { rulesSchemaSubcommand } from './command';
import { CUSTOM_ALERT_EVENT_HELP } from './schema-help';

type RuleType = 'usage_anomaly' | 'error_anomaly' | 'custom_alert';

type SchemaField = {
  field: string;
  required: 'yes' | 'no';
  type: string;
  notes: string;
};

type SchemaExample = {
  name: string;
  body: unknown;
};

type RuleTypeSchema = {
  type: RuleType;
  description: string;
  fields: SchemaField[];
  alertTypeFilterValues?: string[][];
  customAlertFields?: SchemaField[];
  queryJsonFields?: SchemaField[];
  queryJsonBeforeEscaping?: unknown;
  help?: string[];
  examples: SchemaExample[];
  next?: string;
};

const RULE_TYPES: Array<{ type: RuleType; description: string }> = [
  {
    type: 'usage_anomaly',
    description: 'Built-in usage anomaly alerts',
  },
  {
    type: 'error_anomaly',
    description: 'Built-in error anomaly alerts',
  },
  {
    type: 'custom_alert',
    description: 'Custom Observability metric alerts',
  },
];

const BUILT_IN_COMMON_FIELDS: SchemaField[] = [
  ['name', 'yes', 'string', 'Rule name'],
  ['alertTypes', 'yes', 'array', 'One or more alert type configs'],
  ['projectId', 'no', 'string', 'OData project filter; omit for team-wide'],
  ['autosubscribeOwnersInKnock', 'no', 'boolean', 'Subscribe project owners'],
].map(([field, required, type, notes]) => ({
  field,
  required: required as 'yes' | 'no',
  type,
  notes,
}));

const CUSTOM_ALERT_COMMON_FIELDS: SchemaField[] = [
  ['name', 'yes', 'string', 'Rule name'],
  ['projectId', 'no', 'string', 'Defaults to --project or the linked project'],
  ['alertTypes', 'yes', 'array', 'One or more alert type configs'],
  ['customAlert', 'yes', 'object', 'Custom alert definition'],
  ['autosubscribeOwnersInKnock', 'no', 'boolean', 'Subscribe project owners'],
].map(([field, required, type, notes]) => ({
  field,
  required: required as 'yes' | 'no',
  type,
  notes,
}));

const USAGE_METRICS = [
  'fluid_cpu_duration',
  'fluid_duration',
  'fast_data_transfer',
  'edge_requests',
  'function_invocations',
];

const customQueryJson = {
  event: 'incomingRequest',
  rollups: {
    requests: {
      measure: 'count',
      aggregation: 'sum',
    },
  },
  groupBy: ['route'],
  granularity: { minutes: 5 },
};

const ratioQueryJson = {
  event: 'incomingRequest',
  rollups: {
    numerator: {
      measure: 'count',
      aggregation: 'sum',
      filter: 'httpStatus ge 500',
    },
    denominator: {
      measure: 'count',
      aggregation: 'sum',
    },
  },
  granularity: { hours: 1 },
};

const SCHEMAS: Record<RuleType, RuleTypeSchema> = {
  usage_anomaly: {
    type: 'usage_anomaly',
    description: 'Built-in usage anomaly alerts',
    fields: [
      ...BUILT_IN_COMMON_FIELDS,
      field('alertTypes[].type', 'yes', 'string', 'usage_anomaly'),
      field(
        'alertTypes[].filter',
        'no',
        'string',
        'OData filter for this type'
      ),
    ],
    alertTypeFilterValues: [['metric', USAGE_METRICS.join(', ')]],
    examples: [
      {
        name: 'Minimal',
        body: {
          name: 'Usage anomalies',
          alertTypes: [{ type: 'usage_anomaly' }],
        },
      },
      {
        name: 'Filtered to one metric',
        body: {
          name: 'Edge request anomalies',
          projectId: "projectId eq 'prj_123'",
          alertTypes: [
            { type: 'usage_anomaly', filter: "metric eq 'edge_requests'" },
          ],
        },
      },
    ],
  },
  error_anomaly: {
    type: 'error_anomaly',
    description: 'Built-in error anomaly alerts',
    fields: [
      ...BUILT_IN_COMMON_FIELDS,
      field('alertTypes[].type', 'yes', 'string', 'error_anomaly'),
      field(
        'alertTypes[].filter',
        'no',
        'string',
        'OData filter for this type'
      ),
    ],
    alertTypeFilterValues: [
      ['statusGroup', '4xx, 5xx'],
      ['route', `route eq '/api/checkout', contains(route, '/api')`],
    ],
    examples: [
      {
        name: 'Minimal',
        body: {
          name: 'Error anomalies',
          alertTypes: [{ type: 'error_anomaly' }],
        },
      },
      {
        name: 'Filtered to 5xx on one route',
        body: {
          name: 'Checkout 5xx errors',
          projectId: "projectId eq 'prj_123'",
          alertTypes: [
            {
              type: 'error_anomaly',
              filter: "statusGroup eq '5xx' and route eq '/api/checkout'",
            },
          ],
        },
      },
    ],
  },
  custom_alert: {
    type: 'custom_alert',
    description: 'Custom Observability metric alerts',
    fields: [
      ...CUSTOM_ALERT_COMMON_FIELDS,
      field('alertTypes[].type', 'yes', 'string', 'custom_alert'),
    ],
    customAlertFields: [
      field(
        'customAlert.queryJsonString',
        'yes',
        'string',
        'Escaped query JSON'
      ),
      field('customAlert.triggerType', 'yes', 'string', 'threshold, anomaly'),
      field('customAlert.triggerOperator', 'yes', 'string', 'gt, gte, lt, lte'),
      field(
        'customAlert.triggerThreshold',
        'yes',
        'number',
        'Threshold value or z-score'
      ),
      field(
        'customAlert.minThreshold',
        'no',
        'number',
        'Minimum observed value'
      ),
      field('customAlert.formula', 'no', 'object', 'Ratio formula'),
    ],
    queryJsonFields: [
      field(
        'scope',
        'no',
        'object',
        'Selected project on add; stored rule project on update'
      ),
      field(
        'event',
        'yes',
        'string',
        'Alert query event name, for example incomingRequest'
      ),
      field('rollups', 'yes', 'object', 'Named measure aggregations'),
      field('rollups.*.measure', 'yes', 'string', 'Metric measure'),
      field('rollups.*.aggregation', 'yes', 'string', 'Metric aggregation'),
      field('rollups.*.filter', 'no', 'string', 'Rollup-level OData filter'),
      field('groupBy', 'no', 'array', 'At most one dimension'),
      field('filter', 'no', 'string', 'Top-level OData filter'),
      field('granularity', 'no', 'object', '5m, 1h, or 1d; defaults to 5m'),
    ],
    queryJsonBeforeEscaping: customQueryJson,
    help: CUSTOM_ALERT_EVENT_HELP,
    examples: [
      {
        name: 'Anomaly',
        body: {
          name: 'Request volume anomaly',
          alertTypes: [{ type: 'custom_alert' }],
          customAlert: {
            queryJsonString: JSON.stringify(customQueryJson),
            triggerType: 'anomaly',
            triggerOperator: 'gt',
            triggerThreshold: 3,
          },
        },
      },
      {
        name: 'Threshold ratio',
        body: {
          name: 'Checkout error rate',
          alertTypes: [{ type: 'custom_alert' }],
          customAlert: {
            queryJsonString: JSON.stringify(ratioQueryJson),
            triggerType: 'threshold',
            triggerOperator: 'gt',
            triggerThreshold: 0.05,
            formula: {
              operator: 'divide',
              left: 'numerator',
              right: 'denominator',
            },
            minThreshold: 20,
          },
        },
      },
    ],
    next: 'Run `vercel alerts rules schema --type custom_alert <metric-or-prefix>` to show allowed aggregations and dimensions from the metrics schema.',
  },
};

export default async function schema(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(rulesSchemaSubcommand.options)
    );
  } catch (err) {
    printError(err);
    return 1;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }

  const jsonOutput = formatResult.jsonOutput;
  const ruleType = normalizeRuleType(parsedArgs.flags['--type']);
  const metricOrPrefix = parsedArgs.args[0];

  if (!ruleType) {
    if (parsedArgs.flags['--type']) {
      return printSchemaError(
        client,
        jsonOutput,
        `Invalid alert rule type "${String(parsedArgs.flags['--type'])}". Use usage_anomaly, error_anomaly, or custom_alert.`
      );
    }

    if (jsonOutput) {
      client.stdout.write(
        `${JSON.stringify({ types: RULE_TYPES }, null, 2)}\n`
      );
    } else {
      output.log('Alert rule schema');
      output.print(
        `\n${formatRows(
          ['Type', 'Description'],
          RULE_TYPES.map(type => [type.type, type.description])
        )}\n\nRun \`vercel alerts rules schema --type <type>\` to see a rule body schema.\n`
      );
    }
    return 0;
  }

  if (metricOrPrefix && ruleType !== 'custom_alert') {
    return printSchemaError(
      client,
      jsonOutput,
      'Metric or prefix arguments are only supported with --type custom_alert.'
    );
  }

  const ruleSchema = SCHEMAS[ruleType];
  if (!metricOrPrefix) {
    printRuleSchema(client, ruleSchema, jsonOutput);
    return 0;
  }

  const metricDetails = await fetchCustomAlertMetricDetails(
    client,
    metricOrPrefix,
    jsonOutput
  );
  if (typeof metricDetails === 'number') {
    return metricDetails;
  }

  printRuleSchema(client, ruleSchema, jsonOutput, {
    metricOrPrefix,
    metricDetails,
  });
  return 0;
}

function field(
  field: string,
  required: 'yes' | 'no',
  type: string,
  notes: string
): SchemaField {
  return { field, required, type, notes };
}

function normalizeRuleType(value: unknown): RuleType | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');
  return RULE_TYPES.some(type => type.type === normalized)
    ? (normalized as RuleType)
    : undefined;
}

async function fetchCustomAlertMetricDetails(
  client: Client,
  metricOrPrefix: string,
  jsonOutput: boolean
) {
  const { team } = await getScope(client);
  if (!team) {
    const message =
      'The metrics schema API request was not authorized. Run `vercel login` to authenticate and `vercel switch` to select a team, then try again.';
    if (jsonOutput) {
      client.stdout.write(formatErrorJson('SCHEMA_UNAUTHORIZED', message));
    } else {
      output.error(message);
    }
    return 1;
  }

  return fetchMetricDetailOrExit(client, team.id, metricOrPrefix, jsonOutput);
}

function printSchemaError(
  client: Client,
  jsonOutput: boolean,
  message: string
): number {
  if (jsonOutput) {
    client.stdout.write(formatErrorJson('INVALID_ARGUMENTS', message));
  } else {
    output.error(message);
  }
  return 1;
}

function printRuleSchema(
  client: Client,
  schema: RuleTypeSchema,
  jsonOutput: boolean,
  metricSchema?: { metricOrPrefix: string; metricDetails: MetricDetail[] }
): void {
  if (jsonOutput) {
    client.stdout.write(
      `${JSON.stringify(
        {
          schema,
          ...(metricSchema ? { metricSchema } : {}),
        },
        null,
        2
      )}\n`
    );
    return;
  }

  output.log(`Alert rule schema: ${schema.type}`);
  output.print('\n');
  printFieldSection('Fields', schema.fields);

  if (schema.alertTypeFilterValues) {
    printSimpleSection(
      'alertTypes[].filter values',
      ['Field', 'Allowed values / examples'],
      schema.alertTypeFilterValues
    );
  }

  if (schema.customAlertFields) {
    printFieldSection('Custom alert fields', schema.customAlertFields);
  }

  if (schema.queryJsonFields) {
    printFieldSection(
      'customAlert.queryJsonString fields',
      schema.queryJsonFields
    );
  }

  if (schema.queryJsonBeforeEscaping) {
    output.print('customAlert.queryJsonString before escaping\n\n');
    output.print(
      `${indent(JSON.stringify(schema.queryJsonBeforeEscaping, null, 2), 2)}\n\n`
    );
  }

  if (schema.help) {
    printParagraphSection('Custom alert metric discovery', schema.help);
  }

  if (metricSchema?.metricDetails) {
    output.print(`Metric schema: ${metricSchema.metricOrPrefix}\n`);
    const table = formatMetricsTable(metricSchema.metricDetails);
    if (table) {
      output.print(`${table}\n\n`);
    }
  }

  output.print('Body examples\n\n');
  for (const example of schema.examples) {
    output.print(`  ${example.name}\n\n`);
    output.print(`${indent(JSON.stringify(example.body, null, 2), 4)}\n\n`);
  }

  if (schema.next) {
    output.print(`${schema.next}\n`);
  }
}

function printFieldSection(title: string, fields: SchemaField[]): void {
  output.print(`${title}\n\n`);
  output.print(
    `${formatRows(
      ['Field', 'Required', 'Type', 'Values / notes'],
      fields.map(field => [
        field.field,
        field.required,
        field.type,
        field.notes,
      ])
    )}\n\n`
  );
}

function printSimpleSection(
  title: string,
  headers: string[],
  rows: string[][]
): void {
  output.print(`${title}\n\n`);
  output.print(`${formatRows(headers, rows)}\n\n`);
}

function printParagraphSection(title: string, lines: string[]): void {
  output.print(`${title}\n\n`);
  output.print(`${indent(lines.join('\n'), 2)}\n\n`);
}

function formatRows(headers: string[], rows: string[][]): string {
  const alignment = headers.map(() => 'l' as const);
  const tableRows = rows.map(row => [...row]);
  return formatTable(headers, alignment, [{ rows: tableRows }]).trim();
}
