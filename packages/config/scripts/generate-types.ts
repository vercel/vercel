#!/usr/bin/env node
import { writeFileSync } from 'fs';
import { resolve } from 'path';

interface JSONSchema {
  type?: string;
  properties?: Record<string, any>;
  enum?: (string | null)[];
  items?: any;
  required?: string[];
  description?: string;
  deprecated?: boolean;
  maxLength?: number;
  minLength?: number;
  minimum?: number;
  maximum?: number;
  oneOf?: any[];
  anyOf?: any[];
  allOf?: any[];
  additionalProperties?: boolean | any;
  patternProperties?: Record<string, any>;
  $ref?: string;
  const?: string | number | boolean;
  private?: boolean;
}

const HEADER = `/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * This file is generated from the vercel.json OpenAPI schema.
 * To modify, update scripts/generate-types.ts and re-run:
 *   pnpm generate-types
 *
 * Schema: https://openapi.vercel.sh/vercel.json
 */
`;

function generateEnumType(name: string, values: (string | null)[]): string {
  const items = values
    .map(v => (v === null ? 'null' : `'${v}'`))
    .join('\n  | ');
  return `export type ${name} =\n  | ${items};`;
}

function escapeComment(text: string): string {
  return text.replace(/\*\//g, '*\\/');
}

function generateJSDoc(schema: JSONSchema, indent = ''): string {
  const lines: string[] = [];

  if (schema.description) {
    lines.push(`${indent}/**`);
    lines.push(`${indent} * ${escapeComment(schema.description)}`);
    if (schema.deprecated) {
      lines.push(`${indent} * @deprecated`);
    }
    if (schema.private) {
      lines.push(`${indent} * @private`);
    }
    lines.push(`${indent} */`);
  } else if (schema.deprecated || schema.private) {
    lines.push(`${indent}/**`);
    if (schema.deprecated) {
      lines.push(`${indent} * @deprecated`);
    }
    if (schema.private) {
      lines.push(`${indent} * @private`);
    }
    lines.push(`${indent} */`);
  }

  return lines.join('\n');
}

function convertSchemaType(schema: JSONSchema, depth = 0): string {
  const indent = '  '.repeat(depth);

  if (schema.const !== undefined) {
    if (typeof schema.const === 'string') return `'${schema.const}'`;
    return String(schema.const);
  }

  if (schema.enum) {
    return schema.enum.map(v => (v === null ? 'null' : `'${v}'`)).join(' | ');
  }

  if (schema.oneOf) {
    return schema.oneOf.map(s => convertSchemaType(s, depth)).join(' | ');
  }

  if (schema.anyOf) {
    return schema.anyOf.map(s => convertSchemaType(s, depth)).join(' | ');
  }

  if (schema.type === 'array') {
    if (schema.items) {
      const itemType = convertSchemaType(schema.items, depth);
      // Wrap in parens if items is a union (oneOf/anyOf/multi-value enum)
      // to avoid precedence issues like 'a' | 'b'[] or {x} | {y}[]
      const isUnion =
        schema.items.oneOf ||
        schema.items.anyOf ||
        (schema.items.enum && schema.items.enum.length > 1);
      if (isUnion) {
        return `(${itemType})[]`;
      }
      return `${itemType}[]`;
    }
    return 'any[]';
  }

  if (schema.type === 'object') {
    if (
      schema.additionalProperties === false &&
      !schema.properties &&
      !schema.patternProperties
    ) {
      return 'Record<string, never>';
    }

    if (
      schema.additionalProperties &&
      typeof schema.additionalProperties === 'object'
    ) {
      const valueType = convertSchemaType(schema.additionalProperties, depth);
      return `Record<string, ${valueType}>`;
    }

    if (schema.patternProperties) {
      const values = Object.values(schema.patternProperties);
      if (values.length > 0) {
        const valueType = convertSchemaType(values[0], depth);
        return `Record<string, ${valueType}>`;
      }
    }

    if (schema.properties) {
      const lines: string[] = ['{'];
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        const jsdoc = generateJSDoc(propSchema, indent + '  ');
        if (jsdoc) {
          lines.push(jsdoc);
        }
        const optional = !schema.required?.includes(key) ? '?' : '';
        const propType = convertSchemaType(propSchema, depth + 1);
        lines.push(`${indent}  ${key}${optional}: ${propType};`);
      }
      lines.push(`${indent}}`);
      return lines.join('\n');
    }

    return 'Record<string, any>';
  }

  if (Array.isArray(schema.type)) {
    return schema.type
      .map(t => {
        if (t === 'null') return 'null';
        if (t === 'string') return 'string';
        if (t === 'number') return 'number';
        if (t === 'boolean') return 'boolean';
        if (t === 'object') return 'object';
        if (t === 'array') return 'any[]';
        return 'any';
      })
      .join(' | ');
  }

  switch (schema.type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    default:
      return 'any';
  }
}

/**
 * Generate routing types (MatchableValue, Condition, Header, Redirect, Rewrite, HeaderRule, RouteType)
 * from the schema's has/redirects/rewrites/headers definitions.
 *
 * We can't just use convertSchemaType here because we need named types that reference
 * each other (e.g. Condition references MatchableValue, Redirect references Condition[]).
 */
function generateRoutingTypes(schema: JSONSchema): string[] {
  const output: string[] = [];

  const redirectsItemSchema = schema.properties?.redirects?.items;
  const rewritesItemSchema = schema.properties?.rewrites?.items;
  const headersItemSchema = schema.properties?.headers?.items;
  const hasVariants = redirectsItemSchema?.properties?.has?.items?.anyOf;

  if (!hasVariants) return output;

  // MatchableValue — extract from the host variant's value field schema
  const hostVariant = hasVariants.find(
    (v: any) => v.properties?.type?.enum?.[0] === 'host'
  );
  const valueSchema = hostVariant?.properties?.value;
  if (valueSchema) {
    output.push(
      `/**\n * Value for condition matching - can be a string or an operator object\n */`
    );
    output.push(
      `export type MatchableValue = ${convertSchemaType(valueSchema, 0)};`
    );
    output.push('');
  }

  // Condition — discriminated union from has variants, referencing MatchableValue
  output.push(
    `/**\n * Condition for matching in redirects, rewrites, and headers\n */`
  );
  output.push('export type Condition =');
  for (const variant of hasVariants) {
    const types = variant.properties?.type?.enum;
    const required = variant.required || [];
    const typeStr = types.map((t: string) => `'${t}'`).join(' | ');
    const parts: string[] = [`type: ${typeStr}`];
    for (const key of Object.keys(variant.properties || {})) {
      if (key === 'type') continue;
      const optional = !required.includes(key) ? '?' : '';
      parts.push(
        `${key}${optional}: ${key === 'value' ? 'MatchableValue' : 'string'}`
      );
    }
    output.push(`  | { ${parts.join('; ')} }`);
  }
  output.push(';');
  output.push('');

  output.push(
    `/**\n * The object form of MatchableValue (excludes the plain string shorthand)\n */`
  );
  output.push(
    'export type MatchableValueObject = Exclude<MatchableValue, string>;'
  );
  output.push('');

  // Header, Redirect, Rewrite, HeaderRule — generated from their schema definitions
  // with special-cased fields to reference named types instead of inlining
  const typeOverrides: Record<string, string> = {
    has: 'Condition[]',
    missing: 'Condition[]',
    headers: 'Header[]',
  };

  function generateInterface(
    name: string,
    itemSchema: JSONSchema,
    doc: string
  ) {
    if (!itemSchema?.properties) return;
    output.push(`/**\n * ${doc}\n */`);
    output.push(`export interface ${name} {`);
    for (const [key, propSchema] of Object.entries(
      itemSchema.properties as Record<string, JSONSchema>
    )) {
      const jsdoc = generateJSDoc(propSchema, '  ');
      if (jsdoc) output.push(jsdoc);
      const optional = !itemSchema.required?.includes(key) ? '?' : '';
      const propType = typeOverrides[key] || convertSchemaType(propSchema, 1);
      output.push(`  ${key}${optional}: ${propType};`);
    }
    output.push('}');
    output.push('');
  }

  generateInterface(
    'Header',
    headersItemSchema?.properties?.headers?.items,
    'HTTP header key/value pair'
  );
  generateInterface(
    'Redirect',
    redirectsItemSchema,
    'Redirect definition matching vercel.json schema'
  );
  generateInterface(
    'Rewrite',
    rewritesItemSchema,
    'Rewrite definition matching vercel.json schema'
  );
  generateInterface(
    'HeaderRule',
    headersItemSchema,
    'Header rule definition matching vercel.json schema'
  );

  output.push(`/**\n * Union type for all routing helper outputs\n */`);
  output.push(
    'export type RouteType = Redirect | Rewrite | HeaderRule | any; // Route is internal to router'
  );
  output.push('');

  return output;
}

function generateTypes(schema: JSONSchema): string {
  const output: string[] = [HEADER];

  // Extract Framework enum
  const frameworkProp = schema.properties?.framework;
  if (frameworkProp?.enum) {
    output.push(generateEnumType('Framework', frameworkProp.enum));
    output.push('');
  }

  // Generate specific interfaces for nested objects
  const functionsProp = schema.properties?.functions?.patternProperties;
  if (functionsProp) {
    const functionConfigSchema = Object.values(functionsProp)[0] as JSONSchema;
    output.push('export interface FunctionConfig {');

    if (functionConfigSchema.properties) {
      for (const [key, propSchema] of Object.entries(
        functionConfigSchema.properties
      )) {
        const jsdoc = generateJSDoc(propSchema, '  ');
        if (jsdoc) {
          output.push(jsdoc);
        }
        const optional = !functionConfigSchema.required?.includes(key)
          ? '?'
          : '';
        const propType = convertSchemaType(propSchema, 1);
        output.push(`  ${key}${optional}: ${propType};`);
      }
    }

    output.push('}');
    output.push('');
  }

  // Generate CronJob interface
  const cronsProp = schema.properties?.crons;
  if (cronsProp?.items) {
    output.push('export interface CronJob {');
    const cronSchema = cronsProp.items as JSONSchema;
    if (cronSchema.properties) {
      for (const [key, propSchema] of Object.entries(cronSchema.properties)) {
        const jsdoc = generateJSDoc(propSchema, '  ');
        if (jsdoc) {
          output.push(jsdoc);
        }
        const optional = !cronSchema.required?.includes(key) ? '?' : '';
        const propType = convertSchemaType(propSchema, 1);
        output.push(`  ${key}${optional}: ${propType};`);
      }
    }
    output.push('}');
    output.push('');
  }

  // Generate GitConfig interface
  const gitProp = schema.properties?.git;
  if (gitProp?.properties) {
    output.push('export interface GitDeploymentConfig {');
    output.push('  [branch: string]: boolean;');
    output.push('}');
    output.push('');

    output.push('export interface GitConfig {');
    for (const [key, propSchema] of Object.entries(gitProp.properties)) {
      const jsdoc = generateJSDoc(propSchema as JSONSchema, '  ');
      if (jsdoc) {
        output.push(jsdoc);
      }
      const optional = '?';
      let propType = convertSchemaType(propSchema as JSONSchema, 1);
      if (key === 'deploymentEnabled') {
        propType = 'boolean | GitDeploymentConfig';
      }
      output.push(`  ${key}${optional}: ${propType};`);
    }
    output.push('}');
    output.push('');
  }

  // Generate GithubConfig interface
  const githubProp = schema.properties?.github;
  if (githubProp?.properties) {
    output.push('export interface GithubConfig {');
    for (const [key, propSchema] of Object.entries(githubProp.properties)) {
      const jsdoc = generateJSDoc(propSchema as JSONSchema, '  ');
      if (jsdoc) {
        output.push(jsdoc);
      }
      const optional = '?';
      const propType = convertSchemaType(propSchema as JSONSchema, 1);
      output.push(`  ${key}${optional}: ${propType};`);
    }
    output.push('}');
    output.push('');
  }

  // Generate ImageConfig interface
  const imagesProp = schema.properties?.images;
  if (imagesProp?.properties) {
    output.push('export interface ImageConfig {');
    for (const [key, propSchema] of Object.entries(imagesProp.properties)) {
      const jsdoc = generateJSDoc(propSchema as JSONSchema, '  ');
      if (jsdoc) {
        output.push(jsdoc);
      }
      const optional = !imagesProp.required?.includes(key) ? '?' : '';
      const propType = convertSchemaType(propSchema as JSONSchema, 1);
      output.push(`  ${key}${optional}: ${propType};`);
    }
    output.push('}');
    output.push('');
  }

  // Generate ProbeConfig interface
  const probesProp = schema.properties?.probes;
  if (probesProp?.items?.properties) {
    output.push('export interface ProbeConfig {');
    const probeSchema = probesProp.items as JSONSchema;
    for (const [key, propSchema] of Object.entries(probeSchema.properties!)) {
      const jsdoc = generateJSDoc(propSchema, '  ');
      if (jsdoc) {
        output.push(jsdoc);
      }
      const optional = !probeSchema.required?.includes(key) ? '?' : '';
      const propType = convertSchemaType(propSchema, 1);
      output.push(`  ${key}${optional}: ${propType};`);
    }
    output.push('}');
    output.push('');
  }

  // Generate routing types (MatchableValue, Condition, Header, Redirect, Rewrite, HeaderRule)
  // from the schema's has/redirects/rewrites/headers definitions
  output.push(...generateRoutingTypes(schema));

  // Generate other helper types
  const wildcardProp = schema.properties?.wildcard;
  if (wildcardProp?.items?.properties) {
    output.push('export interface WildcardDomain {');
    const wildcardSchema = wildcardProp.items as JSONSchema;
    for (const [key, propSchema] of Object.entries(
      wildcardSchema.properties!
    )) {
      const optional = !wildcardSchema.required?.includes(key) ? '?' : '';
      const propType = convertSchemaType(propSchema, 1);
      output.push(`  ${key}${optional}: ${propType};`);
    }
    output.push('}');
    output.push('');
  }

  const buildProp = schema.properties?.build;
  if (buildProp?.properties) {
    output.push('export interface BuildConfig {');
    for (const [key, propSchema] of Object.entries(buildProp.properties)) {
      const optional = '?';
      const propType = convertSchemaType(propSchema as JSONSchema, 1);
      output.push(`  ${key}${optional}: ${propType};`);
    }
    output.push('}');
    output.push('');
  }

  const buildsProp = schema.properties?.builds;
  if (buildsProp?.items?.properties) {
    output.push('export interface BuildItem {');
    const buildItemSchema = buildsProp.items as JSONSchema;
    for (const [key, propSchema] of Object.entries(
      buildItemSchema.properties!
    )) {
      const optional = !buildItemSchema.required?.includes(key) ? '?' : '';
      const propType = convertSchemaType(propSchema, 1);
      output.push(`  ${key}${optional}: ${propType};`);
    }
    output.push('}');
    output.push('');
  }

  // Generate main VercelConfig interface
  output.push('export interface VercelConfig {');

  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      // Skip $schema as it's generated separately
      if (key === '$schema') continue;

      const jsdoc = generateJSDoc(propSchema, '  ');
      if (jsdoc) {
        output.push(jsdoc);
      }

      const optional = !schema.required?.includes(key) ? '?' : '';
      let propType: string;

      // Custom handling for specific properties
      switch (key) {
        case 'framework':
          propType = 'Framework';
          break;
        case 'functions':
          propType = 'Record<string, FunctionConfig>';
          break;
        case 'crons':
          propType = 'CronJob[]';
          break;
        case 'git':
          propType = 'GitConfig';
          break;
        case 'github':
          propType = 'GithubConfig';
          break;
        case 'images':
          propType = 'ImageConfig';
          break;
        case 'probes':
          propType = 'ProbeConfig[]';
          break;
        case 'wildcard':
          propType = 'WildcardDomain[]';
          break;
        case 'build':
          propType = 'BuildConfig';
          break;
        case 'builds':
          propType = 'BuildItem[]';
          break;
        case 'headers':
          propType = 'HeaderRule[]';
          break;
        case 'redirects':
          propType = 'Redirect[]';
          break;
        case 'rewrites':
          propType = 'Rewrite[]';
          break;
        case 'routes':
          propType = 'RouteType[]';
          break;
        default:
          propType = convertSchemaType(propSchema, 1);
      }

      output.push(`  ${key}${optional}: ${propType};`);
    }
  }

  output.push('}');
  output.push('');
  output.push('');
  output.push(`/**
 * Runtime placeholder for VercelConfig to allow named imports.
 */
export const VercelConfig = {};`);

  return output.join('\n');
}

const SCHEMA_URL = 'https://openapi.vercel.sh/vercel.json';

async function main() {
  try {
    const outputPath = resolve(__dirname, '../src/types.ts');

    console.log(`Fetching schema from: ${SCHEMA_URL}`);
    const res = await fetch(SCHEMA_URL);
    if (!res.ok) throw new Error(`Failed to fetch schema: ${res.status}`);
    const schema: JSONSchema = await res.json();

    console.log('Generating TypeScript types...');
    const types = generateTypes(schema);

    console.log(`Writing types to: ${outputPath}`);
    writeFileSync(outputPath, types, 'utf-8');

    console.log('✅ Successfully generated types!');
  } catch (error) {
    console.error('❌ Failed to generate types:', error);
    process.exit(1);
  }
}

main();
