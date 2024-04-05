import chalk from 'chalk';
import { LOGO, NAME } from '@vercel-internals/constants';
import Table, { CellOptions } from 'cli-table3';

const INDENT = ' '.repeat(2);
const NEWLINE = '\n';

export type PrimitiveConstructor =
  | typeof String
  | typeof Boolean
  | typeof Number;

export interface CommandOption {
  name: string;
  shorthand: string | null;
  type: PrimitiveConstructor | [PrimitiveConstructor];
  argument?: string;
  deprecated: boolean;
  description?: string;
}
export interface CommandArgument {
  name: string;
  required: boolean;
}
export interface CommandExample {
  name: string;
  value: string | string[];
}
export interface Command {
  name: string;
  description: string;
  arguments: CommandArgument[];
  subcommands?: Command[];
  options: CommandOption[];
  examples: CommandExample[];
}

// https://github.com/cli-table/cli-table3/pull/303 adds
// word wrapping per cell but did not include updated types.
type _CellOptions = CellOptions & {
  wordWrap?: boolean;
};

const tableOptions = {
  chars: {
    top: '',
    'top-mid': '',
    'top-left': '',
    'top-right': '',
    bottom: '',
    'bottom-mid': '',
    'bottom-left': '',
    'bottom-right': '',
    left: '',
    'left-mid': '',
    mid: '',
    'mid-mid': '',
    right: '',
    'right-mid': '',
    middle: '',
  },
  style: {
    'padding-left': 0,
    'padding-right': 0,
  },
};

const globalCommandOptions: CommandOption[] = [
  {
    name: 'help',
    shorthand: 'h',
    type: String,
    description: 'Output usage information',
    deprecated: false,
  },
  {
    name: 'version',
    shorthand: 'v',
    type: String,
    description: 'Output the version number',
    deprecated: false,
  },
  {
    name: 'cwd',
    shorthand: null,
    type: String,
    argument: 'DIR',
    description:
      'Sets the current working directory for a single run of a command',
    deprecated: false,
  },
  {
    name: 'local-config',
    shorthand: 'A',
    type: String,
    argument: 'FILE',
    description: 'Path to the local `vercel.json` file',
    deprecated: false,
  },
  {
    name: 'global-config',
    shorthand: 'Q',
    type: String,
    argument: 'DIR',
    description: 'Path to the global `.vercel` directory',
    deprecated: false,
  },
  {
    name: 'debug',
    shorthand: 'd',
    type: String,
    description: 'Debug mode (default off)',
    deprecated: false,
  },
  {
    name: 'no-color',
    shorthand: null,
    type: String,
    description: 'No color mode (default off)',
    deprecated: false,
  },
  {
    name: 'scope',
    shorthand: 'S',
    type: String,
    description: 'Set a custom scope',
    deprecated: false,
  },
  {
    name: 'token',
    shorthand: 't',
    type: String,
    argument: 'TOKEN',
    description: 'Login token',
    deprecated: false,
  },
];

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
export function buildCommandSynopsisLine(command: Command) {
  const line: string[] = [
    INDENT,
    LOGO,
    chalk.bold(NAME),
    chalk.bold(command.name),
  ];
  if (command.arguments.length > 0) {
    for (const argument of command.arguments) {
      line.push(argument.required ? argument.name : `[${argument.name}]`);
    }
  }
  if (command.options.length > 0) {
    line.push('[options]');
  }

  line.push(NEWLINE);
  return lineToString(line);
}

export function buildCommandOptionLines(
  commandOptions: CommandOption[],
  options: BuildHelpOutputOptions,
  sectionTitle: String
) {
  if (commandOptions.length === 0) {
    return null;
  }

  // Filter out deprecated and intentionally undocumented options
  commandOptions = commandOptions.filter(
    option => !option.deprecated && option.description !== undefined
  );

  // Sort command options alphabetically
  commandOptions.sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  );

  // word wrapping requires the wrapped cell to have a fixed width.
  // We need to track cell sizes to ensure the final column of cells is
  // equal to the remainder of unused horizontal space.
  let maxWidthOfUnwrappedColumns = 0;
  const rows: (string | undefined | _CellOptions)[][] = [];
  for (const option of commandOptions) {
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
  subcommands: Command[] | undefined,
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
      outputArray.push(buildValueLine(example.value));
    }
    outputArray.push('');
  }

  return outputArrayToString(outputArray);
}

function buildDescriptionLine(
  command: Command,
  options: BuildHelpOutputOptions
) {
  let wrapingText = wordWrap(command.description, options.columns);
  return `${wrapingText}${NEWLINE}`;
}

interface BuildHelpOutputOptions {
  columns: number;
}

export function buildHelpOutput(
  command: Command,
  options: BuildHelpOutputOptions
) {
  const outputArray: (string | null)[] = [
    '',
    buildCommandSynopsisLine(command),
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
}

export function help(command: Command, options: HelpOptions) {
  return buildHelpOutput(command, {
    columns: options.columns ?? 80,
  });
}
