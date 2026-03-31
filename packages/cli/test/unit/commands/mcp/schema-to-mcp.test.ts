import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { commandSchemaToZod } from '../../../../src/commands/mcp/schema-to-mcp';
import type { CommandSchema } from '../../../../src/util/describe-command';

describe('commandSchemaToZod', () => {
  it('creates positional args when arguments exist', () => {
    const schema: CommandSchema = {
      name: 'test',
      description: 'A test command',
      arguments: [{ name: 'path', required: true }],
      options: [],
      examples: [],
    };

    const result = commandSchemaToZod(schema);
    expect(result.args).toBeDefined();
    // Required args should not be optional
    expect(result.args instanceof z.ZodArray).toBe(true);
  });

  it('creates optional args when no arguments are required', () => {
    const schema: CommandSchema = {
      name: 'test',
      description: 'A test command',
      arguments: [{ name: 'path', required: false }],
      options: [],
      examples: [],
    };

    const result = commandSchemaToZod(schema);
    expect(result.args).toBeDefined();
    expect(result.args instanceof z.ZodOptional).toBe(true);
  });

  it('does not include args key when no arguments exist', () => {
    const schema: CommandSchema = {
      name: 'test',
      description: 'A test command',
      arguments: [],
      options: [],
      examples: [],
    };

    const result = commandSchemaToZod(schema);
    expect(result.args).toBeUndefined();
  });

  it('maps string options to z.string().optional()', () => {
    const schema: CommandSchema = {
      name: 'test',
      description: 'A test command',
      arguments: [],
      options: [
        {
          name: 'target',
          shorthand: null,
          type: 'string',
          deprecated: false,
          description: 'Target environment',
        },
      ],
      examples: [],
    };

    const result = commandSchemaToZod(schema);
    expect(result.target).toBeDefined();
    expect(result.target instanceof z.ZodOptional).toBe(true);
  });

  it('maps boolean options to z.boolean().optional()', () => {
    const schema: CommandSchema = {
      name: 'test',
      description: 'A test command',
      arguments: [],
      options: [
        {
          name: 'force',
          shorthand: 'f',
          type: 'boolean',
          deprecated: false,
        },
      ],
      examples: [],
    };

    const result = commandSchemaToZod(schema);
    expect(result.force).toBeDefined();
    expect(result.force instanceof z.ZodOptional).toBe(true);
  });

  it('maps string[] options to z.array(z.string()).optional()', () => {
    const schema: CommandSchema = {
      name: 'test',
      description: 'A test command',
      arguments: [],
      options: [
        {
          name: 'env',
          shorthand: null,
          type: 'string[]',
          deprecated: false,
          description: 'Environment variables',
        },
      ],
      examples: [],
    };

    const result = commandSchemaToZod(schema);
    expect(result.env).toBeDefined();
    expect(result.env instanceof z.ZodOptional).toBe(true);
  });

  it('skips deprecated options', () => {
    const schema: CommandSchema = {
      name: 'test',
      description: 'A test command',
      arguments: [],
      options: [
        {
          name: 'old-flag',
          shorthand: null,
          type: 'boolean',
          deprecated: true,
        },
        {
          name: 'new-flag',
          shorthand: null,
          type: 'boolean',
          deprecated: false,
        },
      ],
      examples: [],
    };

    const result = commandSchemaToZod(schema);
    expect(result['old-flag']).toBeUndefined();
    expect(result['new-flag']).toBeDefined();
  });

  it('maps number options to z.number().optional()', () => {
    const schema: CommandSchema = {
      name: 'test',
      description: 'A test command',
      arguments: [],
      options: [
        {
          name: 'limit',
          shorthand: null,
          type: 'number',
          deprecated: false,
        },
      ],
      examples: [],
    };

    const result = commandSchemaToZod(schema);
    expect(result.limit).toBeDefined();
    expect(result.limit instanceof z.ZodOptional).toBe(true);
  });

  it('handles a full command schema with multiple option types', () => {
    const schema: CommandSchema = {
      name: 'deploy',
      description: 'Deploy a project',
      arguments: [{ name: 'path', required: false }],
      options: [
        {
          name: 'prod',
          shorthand: null,
          type: 'boolean',
          deprecated: false,
          description: 'Deploy to production',
        },
        {
          name: 'target',
          shorthand: null,
          type: 'string',
          deprecated: false,
          description: 'Target environment',
        },
        {
          name: 'env',
          shorthand: null,
          type: 'string[]',
          deprecated: false,
          description: 'Environment variables',
        },
      ],
      examples: [],
    };

    const result = commandSchemaToZod(schema);
    expect(Object.keys(result)).toEqual(
      expect.arrayContaining(['args', 'prod', 'target', 'env'])
    );
    expect(Object.keys(result)).toHaveLength(4);
  });
});
