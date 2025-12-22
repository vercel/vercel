#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
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
  private?: boolean;
}

const HEADER = `/**
 * Vercel configuration type that mirrors the vercel.json schema
 * https://openapi.vercel.sh/vercel.json
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

  // Keep existing routing types (Header, Condition, Redirect, Rewrite, HeaderRule)
  output.push(`/**
 * HTTP header key/value pair
 */
export interface Header {
  key: string;
  value: string;
}

/**
 * Condition for matching in redirects, rewrites, and headers
 */
export interface Condition {
  type: 'header' | 'cookie' | 'host' | 'query' | 'path';
  key?: string;
  value?: string | number;
  eq?: string | number;
  neq?: string;
  inc?: string[];
  ninc?: string[];
  pre?: string;
  suf?: string;
  re?: string;
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
}

/**
 * Redirect matching vercel.json schema
 * Returned by routes.redirect()
 */
export interface Redirect {
  source: string;
  destination: string;
  permanent?: boolean;
  statusCode?: number;
  has?: Condition[];
  missing?: Condition[];
}

/**
 * Rewrite matching vercel.json schema
 * Returned by routes.rewrite()
 */
export interface Rewrite {
  source: string;
  destination: string;
  has?: Condition[];
  missing?: Condition[];
  respectOriginCacheControl?: boolean;
}

/**
 * Header rule matching vercel.json schema
 * Returned by routes.header() and routes.cacheControl()
 */
export interface HeaderRule {
  source: string;
  headers: Header[];
  has?: Condition[];
  missing?: Condition[];
}

/**
 * Union type for all routing helper outputs
 * Can be simple schema objects (Redirect, Rewrite, HeaderRule) or Routes with transforms
 * Note: Route type is defined in router.ts (uses src/dest instead of source/destination)
 */
export type RouteType = Redirect | Rewrite | HeaderRule | any; // Route is internal to router
`);

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
        case 'redirects':
        case 'rewrites':
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

function main() {
  try {
    const schemaPath = process.argv[2] || '/tmp/vercel-schema.json';
    const outputPath = resolve(__dirname, '../src/types.ts');

    console.log(`Reading schema from: ${schemaPath}`);
    const schemaContent = readFileSync(schemaPath, 'utf-8');
    const schema: JSONSchema = JSON.parse(schemaContent);

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
