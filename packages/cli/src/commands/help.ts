import chalk from 'chalk';
import { LOGO, NAME } from '@vercel-internals/constants';
import Table, { type CellOptions } from 'cli-table3';
import { noBorderChars } from '../util/output/table';
import { globalCommandOptions } from '../util/arg-common';

const INDENT = ' '.repeat(2);
const NEWLINE = '\n';

export type PrimitiveConstructor =
  | typeof String
  | typeof Boolean
  | typeof Number;

export interface CommandOption {
  readonly name: string;
  readonly shorthand: string | null;
  readonly type: PrimitiveConstructor | ReadonlyArray<PrimitiveConstructor>;
  readonly argument?: string;
  readonly deprecated: boolean;
  readonly description?: string;
}
export interface CommandArgument {
  readonly name: string;
  readonly required: boolean;
  readonly multiple?: true;
}
export interface CommandExample {
  readonly name: string;
  readonly value: string | ReadonlyArray<string>;
}
export interface Command {
  readonly name: string;
  readonly aliases: ReadonlyArray<string>;
  readonly description: string;
  readonly default?: true;
  readonly hidden?: true;
  readonly arguments: ReadonlyArray<CommandArgument>;
  readonly subcommands?: ReadonlyArray<Command>;
  readonly options: ReadonlyArray<CommandOption>;
  readonly examples: ReadonlyArray<CommandExample>;
}

// https://github.com/cli-table/cli-table3/pull/303 adds
// word wrapping per cell but did not include updated types.
type _CellOptions = CellOptions & {
  wordWrap?: boolean;
};

const tableOptions = {
  chars: noBorderChars,
  style: {
    'padding-left': 0,
    'padding-right': 0,
  },
};

// Use the word wrapping ability of cli-table3
// by creating a one row, one cell, one column table.
// This allows us to avoid pulling in the word-wrap
// package which ironically seems to do a worse job.
function wordWrap(text: string, maxWidth: number) {
  const _tableOptions = Object.assign({}, tableOptions, {
    colWidths: [maxWidth],
    style: {
      'padding-left': INDENT.length,
    },
  });
  const table = new Table(_tableOptions);
  table.push([
    {
      content: text,
      wordWrap: true,
    } as _CellOptions,
  ]);

  return table.toString();
}

// Insert spaces in between non-whitespace items only
export function lineToString(line: string[]) {
  let string = '';
  for (let i = 0; i < line.length; i++) {
    if (i === line.length - 1) {
      string += line[i];
    } else {
      const curr = line[i];
      const next = line[i + 1];
      string += curr;
      if (curr.trim() !== '' && next.trim() !== '') {
        string += ' ';
      }
    }
  }
  return string;
}

export function outputArrayToString(outputArray: (string | null)[]) {
  return outputArray.filter(line => line !== null).join(NEWLINE);
}

/**
 * Example: `▲ vercel deploy [path] [options]`
 * @param command
 * @returns
 */
export function buildCommandSynopsisLine(command: Command, parent?: Command) {
  const line: string[] = [INDENT, LOGO, chalk.bold(NAME)];
  if (parent) {
    line.push(chalk.bold(parent.name));
  }
  line.push(chalk.bold(command.name));
  const args = command.arguments.slice(0);

  // If there are only subcommands, then there is an implicit "command" argument
  if (
    args.length === 0 &&
    command.subcommands &&
    command.subcommands.length > 0
  ) {
    args.push({
      name: 'command',
      required: !command.subcommands.some(subcommand => subcommand.default),
    });
  }

  if (args.length > 0) {
    for (const argument of args) {
      let { name } = argument;
      if (argument.multiple) {
        name += ' ...';
      }
      line.push(argument.required ? name : `[${name}]`);
    }
  }
  if (command.options.length > 0) {
    line.push('[options]');
  }

  line.push(NEWLINE);
  return lineToString(line);
}

export function buildCommandOptionLines(
  commandOptions: ReadonlyArray<CommandOption>,
  options: BuildHelpOutputOptions,
  sectionTitle: string
) {
  // Filter out deprecated and intentionally undocumented options
  const filteredCommandOptions = commandOptions.filter(
    option => !option.deprecated && option.description !== undefined
  );

  if (filteredCommandOptions.length === 0) {
    return null;
  }

  // Sort command options alphabetically
  filteredCommandOptions.sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  );

  // word wrapping requires the wrapped cell to have a fixed width.
  // We need to track cell sizes to ensure the final column of cells is
  // equal to the remainder of unused horizontal space.
  let maxWidthOfUnwrappedColumns = 0;
  const rows: (string | undefined | _CellOptions)[][] = [];
  for (const option of filteredCommandOptions) {
    const shorthandCell = option.shorthand
      ? `${INDENT}-${option.shorthand},`
      : '';
    let longhandCell = `${INDENT}--${option.name}`;

    if (option.argument) {
      longhandCell += ` <${option.argument}>`;
    }

    longhandCell += INDENT;

    const widthOfUnwrappedColumns = shorthandCell.length + longhandCell.length;
    maxWidthOfUnwrappedColumns = Math.max(
      widthOfUnwrappedColumns,
      maxWidthOfUnwrappedColumns
    );

    rows.push([
      shorthandCell,
      longhandCell,
      {
        content: option.description,
        wordWrap: true,
      },
    ]);
  }

  const finalColumnWidth = options.columns - maxWidthOfUnwrappedColumns;

  const table = new Table(
    Object.assign({}, tableOptions, {
      colWidths: [null, null, finalColumnWidth],
    })
  );

  table.push(...rows);
  return [
    `${INDENT}${chalk.dim(sectionTitle)}:`,
    NEWLINE,
    NEWLINE,
    table.toString(),
    NEWLINE,
    NEWLINE,
  ].join('');
}

export function buildSubcommandLines(
  subcommands: ReadonlyArray<Command> | undefined,
  options: BuildHelpOutputOptions
) {
  if (!subcommands) {
    return null;
  }

  // word wrapping requires the wrapped cell to have a fixed width.
  // We need to track cell sizes to ensure the final column of cells is
  // equal to the remainder of unused horizontal space.
  let maxWidthOfUnwrappedColumns = 0;
  const rows: (string | undefined | _CellOptions)[][] = [];
  for (const command of subcommands) {
    if (command.hidden) {
      continue;
    }
    const nameCell = `${INDENT}${command.name}`;
    let argsCell = INDENT;

    argsCell += command.arguments
      .map(arg => {
        return arg.required ? arg.name : `[${arg.name}]`;
      })
      .join(' ');

    argsCell += INDENT;

    const widthOfUnwrappedColumns = nameCell.length + argsCell.length;
    maxWidthOfUnwrappedColumns = Math.max(
      widthOfUnwrappedColumns,
      maxWidthOfUnwrappedColumns
    );

    rows.push([
      nameCell,
      argsCell,
      {
        content: command.description,
        wordWrap: true,
      },
    ]);
  }

  // Really long descriptions go RIGHT up to the edge, which looks unpleasant.
  const rightMargin = INDENT.repeat(4).length;
  const finalColumnWidth =
    options.columns - maxWidthOfUnwrappedColumns - rightMargin;

  const table = new Table(
    Object.assign({}, tableOptions, {
      colWidths: [null, null, finalColumnWidth],
    })
  );

  table.push(...rows);
  return [
    `${INDENT}${chalk.dim('Commands')}:`,
    NEWLINE,
    NEWLINE,
    table.toString(),
    NEWLINE,
    NEWLINE,
  ].join('');
}

export function buildCommandExampleLines(command: Command) {
  if (!command.examples?.length) {
    return null;
  }
  const outputArray: string[] = [`${INDENT}${chalk.dim('Examples:')}`, ''];
  for (const example of command.examples) {
    const nameLine: string[] = [INDENT];
    nameLine.push(chalk.gray('-'));
    nameLine.push(example.name);
    outputArray.push(lineToString(nameLine));
    outputArray.push('');
    const buildValueLine = (value: string) => {
      return lineToString([INDENT, INDENT, chalk.cyan(`$ ${value}`)]);
    };
    if (Array.isArray(example.value)) {
      for (const line of example.value) {
        outputArray.push(buildValueLine(line));
      }
    } else {
      // The `as string` cast is necessary here since for
      // some reason the `Array.isArray()` check above is
      // properly narrowing the `readonly string[]` type
      outputArray.push(buildValueLine(example.value as string));
    }
    outputArray.push('');
  }

  return outputArrayToString(outputArray);
}

function buildDescriptionLine(
  command: Command,
  options: BuildHelpOutputOptions
) {
  const wrappingText = wordWrap(command.description, options.columns);
  return `${wrappingText}${NEWLINE}`;
}

interface BuildHelpOutputOptions {
  columns: number;
  parent?: Command;
}

export function buildHelpOutput(
  command: Command,
  options: BuildHelpOutputOptions
) {
  const outputArray: (string | null)[] = [
    '',
    buildCommandSynopsisLine(command, options.parent),
    buildDescriptionLine(command, options),
    buildSubcommandLines(command.subcommands, options),
    buildCommandOptionLines(command.options, options, 'Options'),
    buildCommandOptionLines(globalCommandOptions, options, 'Global Options'),
    buildCommandExampleLines(command),
    '',
  ];

  return outputArrayToString(outputArray);
}

export interface HelpOptions {
  columns?: number;
  parent?: Command;
}

export function help(command: Command, options: HelpOptions) {
  return buildHelpOutput(command, {
    ...options,
    columns: options.columns ?? 80,
  });
}
