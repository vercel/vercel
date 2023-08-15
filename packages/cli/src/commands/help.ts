import chalk from 'chalk';
import { LOGO, NAME } from '@vercel-internals/constants';
import Table, { CellOptions } from 'cli-table3';

const INDENT = ' '.repeat(2);
const NEWLINE = '\n';

export interface CommandOption {
  name: string;
  shorthand: string | null;
  type: 'boolean' | 'string';
  argument?: string;
  deprecated: boolean;
  description?: string;
  multi: boolean;
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
  options: CommandOption[];
  examples: CommandExample[];
}

// https://github.com/cli-table/cli-table3/pull/303 adds
// word wrapping per cell but did not include updated types.
type _CellOptions = CellOptions & {
  wordWrap?: boolean;
};

const globalCommandOptions: CommandOption[] = [
  {
    name: 'help',
    shorthand: 'h',
    type: 'string',
    description: 'Output usage information',
    deprecated: false,
    multi: false,
  },
  {
    name: 'version',
    shorthand: 'v',
    type: 'string',
    description: 'Output the version number',
    deprecated: false,
    multi: false,
  },
  {
    name: 'cwd',
    shorthand: null,
    type: 'string',
    argument: 'DIR',
    description:
      'Sets the current working directory for a single run of a command',
    deprecated: false,
    multi: false,
  },
  {
    name: 'local-config',
    shorthand: 'A',
    type: 'string',
    argument: 'FILE',
    description: 'Path to the local `vercel.json` file',
    deprecated: false,
    multi: false,
  },
  {
    name: 'global-config',
    shorthand: 'Q',
    type: 'string',
    argument: 'DIR',
    description: 'Path to the global `.vercel` directory',
    deprecated: false,
    multi: false,
  },
  {
    name: 'debug',
    shorthand: 'd',
    type: 'string',
    description: 'Debug mode (default off)',
    deprecated: false,
    multi: false,
  },
  {
    name: 'no-color',
    shorthand: null,
    type: 'string',
    description: 'No color mode (default off)',
    deprecated: false,
    multi: false,
  },
  {
    name: 'scope',
    shorthand: 'S',
    type: 'string',
    description: 'Set a custom scope',
    deprecated: false,
    multi: false,
  },
  {
    name: 'token',
    shorthand: 't',
    type: 'string',
    argument: 'TOKEN',
    description: 'Login token',
    deprecated: false,
    multi: false,
  },
];

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

  const table = new Table({
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
    colWidths: [null, null, finalColumnWidth],
  });

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

function buildDescriptionLine(command: Command) {
  const line: string[] = [INDENT, command.description, NEWLINE];
  return lineToString(line);
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
    buildDescriptionLine(command),
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
