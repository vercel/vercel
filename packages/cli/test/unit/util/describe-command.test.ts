import { describe, expect, it } from 'vitest';
import {
  commandToSchema,
  outputCommandSchema,
} from '../../../src/util/describe-command';
import type { CommandSchema } from '../../../src/util/describe-command';
import type { Command } from '../../../src/commands/help';
import type Client from '../../../src/util/client';

function createMockClient() {
  let buffer = '';
  return {
    stdout: {
      write(chunk: string) {
        buffer += chunk;
        return true;
      },
    },
    getOutput() {
      return buffer;
    },
  };
}

const simpleCommand: Command = {
  name: 'login',
  aliases: [],
  description: 'Sign in to your Vercel account.',
  arguments: [{ name: 'email', required: false }],
  options: [
    {
      name: 'github',
      shorthand: null,
      type: Boolean,
      deprecated: true,
      description: 'Log in with GitHub',
    },
    {
      name: 'oob',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Out-of-band login',
    },
  ],
  examples: [
    { name: 'Sign in', value: 'vercel login' },
    { name: 'Multi-step', value: ['vercel login', 'vercel whoami'] },
  ],
};

const commandWithSubcommands: Command = {
  name: 'deploy',
  aliases: [],
  description: 'Deploy your project.',
  arguments: [{ name: 'project-path', required: false }],
  subcommands: [
    {
      name: 'init',
      aliases: [],
      description: 'Create a manual deployment',
      arguments: [],
      options: [
        {
          name: 'force',
          shorthand: 'f',
          type: Boolean,
          deprecated: false,
          description: 'Force deploy',
        },
      ],
      examples: [{ name: 'Init', value: 'vercel deploy init' }],
    },
  ],
  options: [
    {
      name: 'prod',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Deploy to production',
    },
    {
      name: 'env',
      shorthand: 'e',
      type: [String],
      argument: 'KEY=VALUE',
      deprecated: false,
      description: 'Environment variables',
    },
    {
      name: 'name',
      shorthand: 'n',
      type: String,
      deprecated: true,
    },
    {
      name: 'regions',
      shorthand: null,
      type: String,
      argument: 'REGION',
      deprecated: false,
      description: 'Set regions',
    },
    {
      name: 'limit',
      shorthand: null,
      type: Number,
      deprecated: false,
      description: 'Limit results',
    },
    {
      name: 'ports',
      shorthand: null,
      type: [Number],
      deprecated: false,
      description: 'Port numbers',
    },
  ],
  examples: [{ name: 'Deploy', value: 'vercel deploy' }],
};

describe('commandToSchema', () => {
  it('converts a simple command to schema', () => {
    const schema = commandToSchema(simpleCommand);

    expect(schema.name).toBe('login');
    expect(schema.description).toBe('Sign in to your Vercel account.');
    expect(schema.arguments).toEqual([{ name: 'email', required: false }]);
    expect(schema.subcommands).toBeUndefined();
  });

  it('excludes deprecated options from schema', () => {
    const schema = commandToSchema(simpleCommand);

    expect(schema.options).toHaveLength(1);
    expect(schema.options[0]).toEqual({
      name: 'oob',
      shorthand: null,
      type: 'boolean',
      deprecated: false,
      description: 'Out-of-band login',
    });
  });

  it('converts examples including multi-line values', () => {
    const schema = commandToSchema(simpleCommand);

    expect(schema.examples).toHaveLength(2);
    expect(schema.examples[0]).toEqual({
      name: 'Sign in',
      value: 'vercel login',
    });
    expect(schema.examples[1]).toEqual({
      name: 'Multi-step',
      value: ['vercel login', 'vercel whoami'],
    });
  });

  it('maps String type to "string"', () => {
    const schema = commandToSchema(commandWithSubcommands);
    const regions = schema.options.find(o => o.name === 'regions');
    expect(regions?.type).toBe('string');
  });

  it('maps Number type to "number"', () => {
    const schema = commandToSchema(commandWithSubcommands);
    const limit = schema.options.find(o => o.name === 'limit');
    expect(limit?.type).toBe('number');
  });

  it('maps [String] type to "string[]"', () => {
    const schema = commandToSchema(commandWithSubcommands);
    const env = schema.options.find(o => o.name === 'env');
    expect(env?.type).toBe('string[]');
  });

  it('maps [Number] type to "number[]"', () => {
    const schema = commandToSchema(commandWithSubcommands);
    const ports = schema.options.find(o => o.name === 'ports');
    expect(ports?.type).toBe('number[]');
  });

  it('includes argument field when present on option', () => {
    const schema = commandToSchema(commandWithSubcommands);
    const env = schema.options.find(o => o.name === 'env');
    expect(env?.argument).toBe('KEY=VALUE');
  });

  it('omits argument field when not present on option', () => {
    const schema = commandToSchema(commandWithSubcommands);
    const prod = schema.options.find(o => o.name === 'prod');
    expect(prod?.argument).toBeUndefined();
  });

  it('excludes deprecated options from subcommand parent', () => {
    const schema = commandToSchema(commandWithSubcommands);
    const name = schema.options.find(o => o.name === 'name');
    expect(name).toBeUndefined();
  });

  it('converts subcommands recursively', () => {
    const schema = commandToSchema(commandWithSubcommands);

    expect(schema.subcommands).toHaveLength(1);
    const init = schema.subcommands![0];
    expect(init.name).toBe('init');
    expect(init.description).toBe('Create a manual deployment');
    expect(init.options).toHaveLength(1);
    expect(init.options[0].name).toBe('force');
    expect(init.options[0].shorthand).toBe('f');
    expect(init.options[0].type).toBe('boolean');
  });

  it('handles a command with no arguments', () => {
    const schema = commandToSchema(commandWithSubcommands.subcommands![0]);
    expect(schema.arguments).toEqual([]);
  });

  it('handles a command with no subcommands', () => {
    const schema = commandToSchema(simpleCommand);
    expect(schema.subcommands).toBeUndefined();
  });

  it('handles a command with no options', () => {
    const bare: Command = {
      name: 'noop',
      aliases: [],
      description: 'Does nothing',
      arguments: [],
      options: [],
      examples: [],
    };
    const schema = commandToSchema(bare);
    expect(schema.options).toEqual([]);
    expect(schema.examples).toEqual([]);
    expect(schema.arguments).toEqual([]);
  });
});

describe('outputCommandSchema', () => {
  it('writes JSON to stdout', () => {
    const mock = createMockClient();

    outputCommandSchema(mock as unknown as Client, simpleCommand);

    const output = mock.getOutput();
    const parsed = JSON.parse(output) as CommandSchema;
    expect(parsed.name).toBe('login');
    expect(parsed.description).toBe('Sign in to your Vercel account.');
    expect(parsed.arguments).toHaveLength(1);
    expect(parsed.options).toHaveLength(1);
    expect(parsed.examples).toHaveLength(2);
  });

  it('writes pretty-printed JSON with trailing newline', () => {
    const mock = createMockClient();

    outputCommandSchema(mock as unknown as Client, simpleCommand);

    const output = mock.getOutput();
    expect(output).toMatch(/^\{/);
    expect(output).toMatch(/\}\n$/);
    // Verify it's indented (pretty-printed)
    expect(output).toContain('  "name": "login"');
  });

  it('produces valid JSON for a complex command with subcommands', () => {
    const mock = createMockClient();

    outputCommandSchema(mock as unknown as Client, commandWithSubcommands);

    const output = mock.getOutput();
    const parsed = JSON.parse(output) as CommandSchema;
    expect(parsed.subcommands).toHaveLength(1);
    expect(parsed.subcommands![0].name).toBe('init');
  });
});
