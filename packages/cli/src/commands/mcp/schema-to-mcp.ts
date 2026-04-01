import { z } from 'zod';
import type { CommandSchema } from '../../util/describe-command';

/**
 * Convert a CommandSchema into a Zod object schema for MCP tool input.
 *
 * Mapping:
 *   CommandOption type 'string'   → z.string().optional()
 *   CommandOption type 'boolean'  → z.boolean().optional()
 *   CommandOption type 'number'   → z.number().optional()
 *   CommandOption type 'string[]' → z.array(z.string()).optional()
 *   CommandOption type 'number[]' → z.array(z.number()).optional()
 *
 * Boolean flags use the option name (e.g., "prod", "force", "yes").
 * String/number flags use the option name (e.g., "target", "env").
 * Positional arguments become a top-level "args" array.
 */
export function commandSchemaToZod(
  schema: CommandSchema
): Record<string, z.ZodType> {
  const shape: Record<string, z.ZodType> = {};

  // Positional arguments
  if (schema.arguments.length > 0) {
    shape.args = schema.arguments.some(a => a.required)
      ? z.array(z.string()).describe('Positional arguments')
      : z.array(z.string()).optional().describe('Positional arguments');
  }

  // Options (skip deprecated ones)
  for (const opt of schema.options) {
    if (opt.deprecated) continue;

    const key = opt.name;
    let zodType: z.ZodType;

    switch (opt.type) {
      case 'boolean':
        zodType = z.boolean().optional();
        break;
      case 'string':
        zodType = z.string().optional();
        break;
      case 'number':
        zodType = z.number().optional();
        break;
      case 'string[]':
        zodType = z.array(z.string()).optional();
        break;
      case 'number[]':
        zodType = z.array(z.number()).optional();
        break;
      default:
        zodType = z.string().optional();
    }

    if (opt.description) {
      zodType = zodType.describe(opt.description);
    }

    shape[key] = zodType;
  }

  return shape;
}
