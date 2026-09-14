import type Client from '../../../util/client';
import output from '../../../output-manager';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import { isAPIError } from '../../../util/errors-ts';
import { validateJsonOutput } from '../../../util/output-format';
import formatTable from '../../../util/format-table';
import indent from '../../../util/output/indent';
import { packageName } from '../../../util/pkg-name';
import { rulesSchemaSubcommand } from './command';
import { resolveRulesTeam } from './parse-scope';
import { handleRulesApiError, outputRulesError, rulesSchemaPath } from './util';
import type {
  AlertRuleAuthoringConstraint,
  AlertRuleAuthoringExample,
  AlertRuleAuthoringRuleType,
  AlertRuleAuthoringSchemaResponse,
  PublicAlertRuleType,
} from './types';

interface SchemaField {
  requirement: 'required' | 'optional' | 'conditional';
  types: string[];
  descriptions: string[];
}

type JsonSchema = Record<string, unknown>;

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
  } catch (error) {
    printError(error);
    return 1;
  }

  const format = validateJsonOutput(parsedArgs.flags);
  if (!format.valid) {
    return outputRulesError(client, false, 'INVALID_ARGUMENTS', format.error);
  }

  const value = parsedArgs.flags['--type'];
  if (value !== undefined && value !== 'built-in' && value !== 'custom') {
    const suggestion =
      value === 'custom_alert'
        ? ' Use custom; alert rule types are built-in and custom.'
        : '';
    return outputRulesError(
      client,
      format.jsonOutput,
      'INVALID_RULE_TYPE',
      `Invalid rule type "${String(value)}".${suggestion} Expected built-in or custom.`
    );
  }

  const type = value as PublicAlertRuleType | undefined;
  const scope = await resolveRulesTeam(client, format.jsonOutput);
  if (typeof scope === 'number') return scope;

  output.spinner('Fetching alert rule schema…');
  try {
    const document = await client.fetch<AlertRuleAuthoringSchemaResponse>(
      rulesSchemaPath(scope.teamId, type)
    );

    if (format.jsonOutput) {
      client.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
      return 0;
    }

    if (!type) {
      printSchemaIndex(document.ruleTypes);
      return 0;
    }

    const ruleSchema = document.ruleTypes.find(item => item.type === type);
    if (!ruleSchema) {
      return outputRulesError(
        client,
        false,
        'INVALID_SCHEMA_RESPONSE',
        `The API did not return the ${type} alert rule schema.`
      );
    }

    printSchema(ruleSchema);
    return 0;
  } catch (error) {
    if (isAPIError(error)) {
      return handleRulesApiError(client, error, format.jsonOutput);
    }
    throw error;
  } finally {
    output.stopSpinner();
  }
}

function printSchemaIndex(ruleTypes: AlertRuleAuthoringRuleType[]): void {
  output.log('Alert rule schemas');
  output.print(
    `${formatRows(
      ['Type', 'Description'],
      ruleTypes.map(item => [item.type, item.description])
    )}\nRun \`${packageName} alerts rules schema --type <type>\` for fields and examples.\n`
  );
}

function printSchema(schema: AlertRuleAuthoringRuleType): void {
  output.log(`Alert rule schema: ${schema.type}`);
  output.print(`${schema.description}\n\n`);
  printCliScope(schema.type);
  printFields(schema);

  if (schema.metricDiscovery) {
    output.print('Metric discovery\n\n');
    output.print(`${indent(schema.metricDiscovery.command, 2)}\n`);
    output.print(`${indent(schema.metricDiscovery.description, 4)}\n\n`);
  }

  printConstraints(schema.constraints);
  printExamples('Create examples', 'create', schema.create.examples);
  printExamples('Update examples', 'update', schema.update.examples);
}

function printCliScope(type: PublicAlertRuleType): void {
  output.print('CLI scope flags\n\n');
  output.print(`${indent('--project <name-or-id>', 2)}\n`);
  output.print(
    `${indent(
      type === 'built-in'
        ? 'Apply the rule only to the resolved project'
        : 'Set the project evaluated by the rule',
      4
    )}\n`
  );
  if (type === 'built-in') {
    output.print(`${indent('--all', 2)}\n`);
    output.print(`${indent('Apply the rule to every team project', 4)}\n`);
  }
  output.print(
    `${indent('Use a scope flag or ruleScope in the body, not both.', 2)}\n\n`
  );
}

function printFields(schema: AlertRuleAuthoringRuleType): void {
  const createFields = collectFields(schema.create.jsonSchema);
  const updateFields = collectFields(schema.update.jsonSchema);
  const paths = [
    ...createFields.keys(),
    ...[...updateFields.keys()].filter(path => !createFields.has(path)),
  ];

  output.print('Fields\n\n');
  for (const path of paths) {
    const create = createFields.get(path);
    const update = updateFields.get(path);
    const types = unique([...(create?.types ?? []), ...(update?.types ?? [])]);
    const descriptions = unique([
      ...(create?.descriptions ?? []),
      ...(update?.descriptions ?? []),
    ]);

    output.print(`${indent(path, 2)}\n`);
    output.print(
      `${indent(
        `${types.join(' | ') || 'value'} · create ${
          create?.requirement ?? 'not accepted'
        } · update ${update?.requirement ?? 'not accepted'}`,
        4
      )}\n`
    );
    if (descriptions[0]) {
      output.print(`${indent(descriptions[0], 4)}\n`);
    }
    output.print('\n');
  }
}

function collectFields(schema: JsonSchema): Map<string, SchemaField> {
  const fields = new Map<string, SchemaField>();
  visitObjectSchema(schema, '', false, fields);
  return fields;
}

function visitObjectSchema(
  schema: JsonSchema,
  prefix: string,
  conditional: boolean,
  fields: Map<string, SchemaField>
): void {
  const properties = asSchemaRecord(schema.properties);
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter(
          (item): item is string => typeof item === 'string'
        )
      : []
  );

  for (const [name, propertySchema] of Object.entries(properties)) {
    const path = prefix ? `${prefix}.${name}` : name;
    const requirement = conditional
      ? 'conditional'
      : required.has(name)
        ? 'required'
        : 'optional';
    addField(fields, path, propertySchema, requirement);
    visitNestedSchema(propertySchema, path, requirement !== 'required', fields);
  }

  for (const variant of schemaVariants(schema)) {
    visitObjectSchema(variant, prefix, true, fields);
  }
}

function visitNestedSchema(
  schema: JsonSchema,
  path: string,
  conditional: boolean,
  fields: Map<string, SchemaField>
): void {
  if (schema.properties || schema.oneOf || schema.anyOf || schema.allOf) {
    visitObjectSchema(schema, path, conditional, fields);
  }

  const additionalProperties = asSchema(schema.additionalProperties);
  if (additionalProperties) {
    const entryPath = `${path}.<key>`;
    addField(fields, entryPath, additionalProperties, 'conditional');
    visitNestedSchema(additionalProperties, entryPath, true, fields);
  }

  const items = asSchema(schema.items);
  if (items) {
    visitNestedSchema(items, `${path}[]`, true, fields);
  }

  if (Array.isArray(schema.prefixItems)) {
    for (const item of schema.prefixItems) {
      const itemSchema = asSchema(item);
      if (itemSchema) visitNestedSchema(itemSchema, `${path}[]`, true, fields);
    }
  }
}

function addField(
  fields: Map<string, SchemaField>,
  path: string,
  schema: JsonSchema,
  requirement: SchemaField['requirement']
): void {
  const current = fields.get(path);
  const type = describeSchemaType(schema);
  const description =
    typeof schema.description === 'string' ? schema.description : undefined;

  if (!current) {
    fields.set(path, {
      requirement,
      types: type ? [type] : [],
      descriptions: description ? [description] : [],
    });
    return;
  }

  current.types = unique([...current.types, ...(type ? [type] : [])]);
  current.descriptions = unique([
    ...current.descriptions,
    ...(description ? [description] : []),
  ]);
  if (current.requirement !== requirement) current.requirement = 'conditional';
}

function describeSchemaType(schema: JsonSchema): string {
  if ('const' in schema) return formatLiteral(schema.const);
  if (Array.isArray(schema.enum)) {
    return schema.enum.map(formatLiteral).join(' | ');
  }

  const variants = schemaVariants(schema)
    .map(describeSchemaType)
    .filter(Boolean);
  if (variants.length > 0) return unique(variants).join(' | ');

  if (schema.type === 'array' || schema.prefixItems || schema.items) {
    if (Array.isArray(schema.prefixItems)) {
      const tuple = schema.prefixItems
        .map(asSchema)
        .filter((item): item is JsonSchema => item !== undefined)
        .map(describeSchemaType)
        .join(', ');
      return `[${tuple || 'value'}]`;
    }
    const item = asSchema(schema.items);
    return `${item ? describeSchemaType(item) : 'value'}[]`;
  }

  if (schema.type === 'object' || schema.properties) {
    const value = asSchema(schema.additionalProperties);
    return value ? `record<string, ${describeSchemaType(value)}>` : 'object';
  }

  return typeof schema.type === 'string' ? schema.type : 'value';
}

function schemaVariants(schema: JsonSchema): JsonSchema[] {
  return ['oneOf', 'anyOf', 'allOf'].flatMap(key => {
    const value = schema[key];
    if (!Array.isArray(value)) return [];
    return value
      .map(asSchema)
      .filter((item): item is JsonSchema => item !== undefined);
  });
}

function asSchema(value: unknown): JsonSchema | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonSchema)
    : undefined;
}

function asSchemaRecord(value: unknown): Record<string, JsonSchema> {
  const schema = asSchema(value);
  if (!schema) return {};
  return Object.fromEntries(
    Object.entries(schema).filter(
      (entry): entry is [string, JsonSchema] => asSchema(entry[1]) !== undefined
    )
  );
}

function formatLiteral(value: unknown): string {
  return typeof value === 'string'
    ? value
    : (JSON.stringify(value) ?? String(value));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function printConstraints(constraints: AlertRuleAuthoringConstraint[]): void {
  if (constraints.length === 0) return;

  output.print('Constraints\n\n');
  for (const constraint of constraints) {
    const operations = constraint.appliesTo.join('/');
    const kind =
      constraint.kind === 'request' ? '' : ` · ${humanize(constraint.kind)}`;
    output.print(
      `${indent(`${humanize(constraint.code)} · ${operations}${kind}`, 2)}\n`
    );
    output.print(`${indent(`Paths: ${constraint.paths.join(', ')}`, 4)}\n`);
    output.print(`${indent(constraint.description, 4)}\n\n`);
  }
}

function humanize(value: string): string {
  const words = value.replace(/[-_]/g, ' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function printExamples(
  title: string,
  operation: 'create' | 'update',
  examples: AlertRuleAuthoringExample[]
): void {
  output.print(`${title}\n\n`);
  for (const example of examples) {
    const fileName = operation === 'create' ? 'rule.json' : 'patch.json';
    const command =
      operation === 'create'
        ? `${packageName} alerts rules add --body ./${fileName}`
        : `${packageName} alerts rules update <rule-id> --body ./${fileName}`;
    output.print(`${indent(example.name, 2)}\n`);
    output.print(`${indent(`Body (${fileName}):`, 4)}\n`);
    output.print(`${indent(JSON.stringify(example.body, null, 2), 6)}\n`);
    output.print(`${indent(command, 4)}\n\n`);
  }
}

function formatRows(headers: string[], rows: string[][]): string {
  return formatTable(
    headers,
    headers.map(() => 'l' as const),
    [{ rows }]
  ).trim();
}
