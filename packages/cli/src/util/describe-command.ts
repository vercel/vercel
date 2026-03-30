import type Client from './client';
import type { Command, CommandOption } from '../commands/help';

export interface CommandSchema {
  name: string;
  description: string;
  arguments: Array<{ name: string; required: boolean }>;
  options: Array<{
    name: string;
    shorthand: string | null;
    type: string;
    argument?: string;
    description?: string;
    deprecated: boolean;
  }>;
  subcommands?: CommandSchema[];
  examples: Array<{ name: string; value: string | string[] }>;
}

function optionTypeToString(type: CommandOption['type']): string {
  if (Array.isArray(type)) {
    const inner = type[0];
    if (inner === String) return 'string[]';
    if (inner === Number) return 'number[]';
    return 'string[]';
  }
  if (type === String) return 'string';
  if (type === Boolean) return 'boolean';
  if (type === Number) return 'number';
  return 'string';
}

/** Convert a Command definition to a machine-readable schema. */
export function commandToSchema(command: Command): CommandSchema {
  const schema: CommandSchema = {
    name: command.name,
    description: command.description,
    arguments: command.arguments.map(arg => ({
      name: arg.name,
      required: arg.required,
    })),
    options: command.options.map(opt => {
      const entry: CommandSchema['options'][number] = {
        name: opt.name,
        shorthand: opt.shorthand,
        type: optionTypeToString(opt.type),
        deprecated: opt.deprecated,
      };
      if (opt.argument) {
        entry.argument = opt.argument;
      }
      if (opt.description) {
        entry.description = opt.description;
      }
      return entry;
    }),
    examples: command.examples.map(ex => ({
      name: ex.name,
      value: (Array.isArray(ex.value) ? [...ex.value] : ex.value) as
        | string
        | string[],
    })),
  };

  if (command.subcommands && command.subcommands.length > 0) {
    schema.subcommands = command.subcommands.map(sub => commandToSchema(sub));
  }

  return schema;
}

/** Write schema as JSON to stdout. */
export function outputCommandSchema(client: Client, command: Command): void {
  const schema = commandToSchema(command);
  client.stdout.write(JSON.stringify(schema, null, 2) + '\n');
}
