import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import { LOGO, NAME } from '@vercel-internals/constants';

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

export function calcLineLength(line: string[]) {
  return stripAnsi(lineToString(line)).length;
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

export function outputArrayToString(outputArray: string[]) {
  return outputArray.join(NEWLINE);
}

/**
 * Example: `▲ vercel deploy [path] [options]`
 * @param command
 * @returns
 */
export function buildCommandSynopsisLine(command: Command) {
  const line: string[] = [LOGO, chalk.bold(NAME), chalk.bold(command.name)];
  if (command.arguments.length > 0) {
    for (const argument of command.arguments) {
      line.push(argument.required ? argument.name : `[${argument.name}]`);
    }
  }
  if (command.options.length > 0) {
    line.push('[options]');
  }
  return lineToString(line);
}

export function buildCommandOptionLines(
  commandOptions: CommandOption[],
  options: BuildHelpOutputOptions,
  sectionTitle: String
) {
  // Filter out deprecated and intentionally undocumented options
  commandOptions = commandOptions.filter(
    option => !option.deprecated && option.description !== undefined
  );

  if (commandOptions.length === 0) {
    return '';
  }

  // Initialize output array with header and empty line
  const outputArray: string[] = [`${chalk.dim(sectionTitle)}:`, ''];

  // Start building option lines
  const optionLines: string[][] = [];
  // Sort command options alphabetically
  commandOptions.sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  );
  // Keep track of longest "start" of an option line to determine description spacing
  let maxLineStartLength = 0;
  // Iterate over options and create the "start" of each option (e.g. `  -b, --build-env <key=value>`)
  for (const option of commandOptions) {
    const startLine: string[] = [INDENT];
    if (option.shorthand) {
      startLine.push(`-${option.shorthand},`);
    }
    startLine.push(`--${option.name}`);
    if (option.argument) {
      startLine.push(`<${option.argument}>`);
    }
    // the length includes the INDENT
    const lineLength = calcLineLength(startLine);
    maxLineStartLength = Math.max(lineLength, maxLineStartLength);
    optionLines.push(startLine);
  }
  /*
   * Iterate over in-progress option lines to add space-filler and description
   * For Example:
   * |  --archive                    My description starts here.
   * |
   * |  -b, --build-env <key=value>  Start of description here then
   * |                               it wraps here.
   * |
   * |  -e, --env <key=value>        My description is short.
   *
   * Breaking down option lines:
   * |  -b, --build-env <key=value>  Start of description here then
   * |[][                         ][][                             ]
   * |↑ ↑                          ↑ ↑
   * |1 2                          3 4
   * |                               it wraps here.
   * |[][                           ][                            ]
   * |↑ ↑                            ↑
   * |5 6                            7
   * | 1, 5 = indent
   * | 2 = start
   * | 3, 6 = space-filler
   * | 4, 7 = description
   */
  for (let i = 0; i < optionLines.length; i++) {
    const optionLine = optionLines[i];
    const option = commandOptions[i];
    // Add only 2 spaces to the longest line, and then make all shorter lines the same length.
    optionLine.push(
      ' '.repeat(2 + (maxLineStartLength - calcLineLength(optionLine)))
    );

    // Descriptions may be longer than max line length. Wrap them to the same column as the first description line
    const lines: string[][] = [optionLine];
    if (option.description) {
      for (const descriptionWord of option.description.split(' ')) {
        // insert a new line when the next word would match or exceed the maximum line length
        if (
          calcLineLength(lines[lines.length - 1]) +
            stripAnsi(descriptionWord).length >=
          options.columns
        ) {
          // initialize the new line with the necessary whitespace. The INDENT is apart of `maxLineStartLength`
          lines.push([' '.repeat(maxLineStartLength + 2)]);
        }
        // insert the word to the current last line
        lines[lines.length - 1].push(descriptionWord);
      }
    }
    // for every line, transform into a string and push it to the output
    for (const line of lines) {
      outputArray.push(lineToString(line));
    }
  }

  // return the entire list of options as a single string after delete the last '\n' added to the option list
  return outputArrayToString(outputArray);
}

export function buildCommandExampleLines(command: Command) {
  const outputArray: string[] = [chalk.dim(`Examples:`), ''];
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
  // delete the last newline added after examples iteration
  outputArray.splice(-1);

  return outputArrayToString(outputArray);
}

interface BuildHelpOutputOptions {
  columns: number;
}

export function buildHelpOutput(
  command: Command,
  options: BuildHelpOutputOptions
) {
  const outputArray: string[] = [
    buildCommandSynopsisLine(command),
    '',
    command.description,
    '',
    buildCommandOptionLines(command.options, options, 'Options'),
    '',
    buildCommandOptionLines(globalCommandOptions, options, 'Global Options'),
    '',
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
