import { z } from 'zod';

/**
 * Validates and type-checks regex patterns for Vercel's path-to-regexp syntax.
 *
 * @example
 * // Valid patterns:
 * "/api/(.*)"           // Basic capture group
 * "/blog/:slug"         // Named parameter
 * "/feedback/((?!general).*)" // Negative lookahead in a group
 *
 * // Invalid patterns:
 * "/feedback/(?!general)" // Negative lookahead without group
 * "[unclosed"            // Invalid regex syntax
 * "/*"                   // Invalid wildcard pattern
 */
export function validateRegexPattern(pattern: string): string {
  // Check for common path-to-regexp syntax errors
  if (pattern.includes('(?!') && !pattern.includes('((?!')) {
    throw new Error(
      `Invalid path-to-regexp pattern: Negative lookaheads must be wrapped in a group. ` +
        `Use "((?!pattern).*)" instead of "(?!pattern)". Pattern: ${pattern}`
    );
  }

  // Check for invalid wildcard patterns
  if (pattern.includes('/*') || pattern.includes('/**')) {
    throw new Error(
      `Invalid path-to-regexp pattern: Use '(.*)' instead of '*' for wildcards. ` +
        `Pattern: ${pattern}`
    );
  }

  try {
    // Test if it's a valid regex pattern
    new RegExp(pattern);
    return pattern;
  } catch (e) {
    throw new Error(`Invalid regex pattern: ${pattern}`);
  }
}

/**
 * Type for cron expression parts
 */
export type CronPart = {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
};

/**
 * Zod schema for validating cron expressions
 */
const cronPartSchema = z.object({
  minute: z
    .string()
    .regex(
      /^(\*|[0-5]?[0-9]|\*\/[0-9]+|[0-5]?[0-9]-[0-5]?[0-9](,[0-5]?[0-9]-[0-5]?[0-9])*)$/
    ),
  hour: z
    .string()
    .regex(
      /^(\*|1?[0-9]|2[0-3]|\*\/[0-9]+|1?[0-9]-1?[0-9]|2[0-3]-2[0-3](,1?[0-9]-1?[0-9]|,2[0-3]-2[0-3])*)$/
    ),
  dayOfMonth: z
    .string()
    .regex(
      /^(\*|[1-2]?[0-9]|3[0-1]|\*\/[0-9]+|[1-2]?[0-9]-[1-2]?[0-9]|3[0-1]-3[0-1](,[1-2]?[0-9]-[1-2]?[0-9]|,3[0-1]-3[0-1])*)$/
    ),
  month: z
    .string()
    .regex(
      /^(\*|[1-9]|1[0-2]|\*\/[0-9]+|[1-9]-[1-9]|1[0-2]-1[0-2](,[1-9]-[1-9]|,1[0-2]-1[0-2])*)$/
    ),
  dayOfWeek: z
    .string()
    .regex(/^(\*|[0-6]|\*\/[0-9]+|[0-6]-[0-6](,[0-6]-[0-6])*)$/),
});

/**
 * Parses a cron expression into its parts
 */
export function parseCronExpression(expression: string): CronPart {
  const parts = expression.split(' ');
  if (parts.length !== 5) {
    throw new Error('Invalid cron expression: must have 5 parts');
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return cronPartSchema.parse({
    minute,
    hour,
    dayOfMonth,
    month,
    dayOfWeek,
  });
}

/**
 * Creates a type-safe cron expression builder
 */
export function createCronExpression(parts: CronPart): string {
  const validated = cronPartSchema.parse(parts);
  return `${validated.minute} ${validated.hour} ${validated.dayOfMonth} ${validated.month} ${validated.dayOfWeek}`;
}

/**
 * Counts the number of capture groups in a regex pattern.
 * This includes both numbered groups (.*) and named parameters (:name).
 */
export function countCaptureGroups(pattern: string): number {
  let count = 0;

  // Count regex capture groups (parentheses that aren't non-capturing)
  const regex = /\((?!\?:)/g;
  const matches = pattern.match(regex);
  if (matches) {
    count += matches.length;
  }

  // Count named parameters (:name)
  const namedParams = pattern.match(/:[a-zA-Z_][a-zA-Z0-9_]*/g);
  if (namedParams) {
    count += namedParams.length;
  }

  return count;
}

/**
 * Validates that a destination string doesn't reference capture groups
 * that don't exist in the source pattern.
 */
export function validateCaptureGroupReferences(
  source: string,
  destination: string
): void {
  const captureGroupCount = countCaptureGroups(source);

  const references = destination.match(/\$(\d+)/g);
  if (!references) return;

  for (const ref of references) {
    const groupNum = parseInt(ref.substring(1), 10);
    if (groupNum > captureGroupCount) {
      throw new Error(
        `Invalid capture group reference: ${ref} used in destination "${destination}", ` +
          `but source pattern "${source}" only has ${captureGroupCount} capture group(s). ` +
          `Valid references are: ${Array.from({ length: captureGroupCount }, (_, i) => `$${i + 1}`).join(', ') || 'none'}`
      );
    }
  }
}

/**
 * Validates that a value is a static string literal (not computed, not a function call, etc.)
 * Used for static fields that must be extracted before build execution.
 */
export function validateStaticString(value: any, fieldName: string): void {
  if (typeof value !== 'string') {
    throw new Error(
      `Field "${fieldName}" must be a static string literal. ` +
        `Got ${typeof value}. Function calls, variables, and expressions are not allowed.`
    );
  }
}

/**
 * Validates that a value is a static boolean literal
 */
export function validateStaticBoolean(value: any, fieldName: string): void {
  if (typeof value !== 'boolean') {
    throw new Error(
      `Field "${fieldName}" must be a static boolean literal. ` +
        `Got ${typeof value}. Only true or false are allowed.`
    );
  }
}

/**
 * Validates that a value is a static object with primitive values
 * Used for git.deploymentEnabled and similar objects that need to be static
 */
export function validateStaticObject(value: any, fieldName: string): void {
  if (typeof value !== 'object' || value === null) {
    throw new Error(
      `Field "${fieldName}" must be a static object with primitive values. ` +
        `Got ${typeof value}.`
    );
  }

  for (const [key, val] of Object.entries(value)) {
    if (
      typeof val !== 'boolean' &&
      typeof val !== 'string' &&
      typeof val !== 'number'
    ) {
      throw new Error(
        `Field "${fieldName}.${key}" must contain only static primitive values (string, number, boolean). ` +
          `Got ${typeof val}.`
      );
    }
  }
}

/**
 * Validates that a value is a static array of strings
 */
export function validateStaticStringArray(value: any, fieldName: string): void {
  if (!Array.isArray(value)) {
    throw new Error(
      `Field "${fieldName}" must be a static array of strings. ` +
        `Got ${typeof value}.`
    );
  }

  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string') {
      throw new Error(
        `Field "${fieldName}[${i}]" must be a static string. ` +
          `Got ${typeof value[i]}.`
      );
    }
  }
}

/**
 * Validates static fields in VercelConfig that must be extracted before build execution.
 * These fields include:
 * - buildCommand, devCommand, installCommand, framework, nodeVersion, outputDirectory
 * - github.enabled, github.autoAlias, github.autoJobCancelation
 * - git.deploymentEnabled
 * - relatedProjects
 */
export function validateStaticFields(config: Record<string, any>): void {
  // Validate string fields
  const stringFields = [
    'buildCommand',
    'devCommand',
    'installCommand',
    'framework',
    'nodeVersion',
    'outputDirectory',
  ];
  for (const field of stringFields) {
    if (config[field] !== undefined && config[field] !== null) {
      validateStaticString(config[field], field);
    }
  }

  // Validate relatedProjects (array of strings)
  if (config.relatedProjects !== undefined) {
    validateStaticStringArray(config.relatedProjects, 'relatedProjects');
  }

  // Validate git.deploymentEnabled (boolean or object with branch booleans)
  if (config.git !== undefined && config.git.deploymentEnabled !== undefined) {
    const deploymentEnabled = config.git.deploymentEnabled;
    if (typeof deploymentEnabled === 'boolean') {
      validateStaticBoolean(deploymentEnabled, 'git.deploymentEnabled');
    } else {
      validateStaticObject(deploymentEnabled, 'git.deploymentEnabled');
    }
  }

  // Validate github fields (booleans)
  const githubBooleanFields = ['enabled', 'autoAlias', 'autoJobCancelation'];
  if (config.github !== undefined) {
    for (const field of githubBooleanFields) {
      if (config.github[field] !== undefined) {
        validateStaticBoolean(config.github[field], `github.${field}`);
      }
    }
  }
}
