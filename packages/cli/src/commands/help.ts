import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import { LOGO, NAME } from '@vercel-internals/constants';

const INDENT = ' '.repeat(2);
const NEWLINE = '\n';
const MAX_LINE_LENGTH = process.stdout.columns;

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

function calcLineLength(line: string[]) {
  return stripAnsi(lineToString(line)).length;
}

// Insert spaces in between non-whitespace items only
function lineToString(line: string[]) {
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

function outputArrayToString(outputArray: string[]) {
  return outputArray.reduce((acc, line) => acc + `${line}${NEWLINE}`, '');
}

/**
 * Example: `▲ vercel deploy [path] [options]`
 * @param command
 * @returns
 */
function buildCommandSynopsisLine(command: Command) {
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

function buildCommandOptionLines(command: Command) {
  // Filter out deprecated and intentionally undocumented options
  command.options = command.options.filter(
    option => !option.deprecated && option.description !== undefined
  );

  // Initialize output array with header and empty line
  const outputArray: string[] = [chalk.dim(`Options:`), ''];

  // Start building option lines
  const optionLines: string[][] = [];
  // Sort command options alphabetically
  command.options.sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  );
  // Keep track of longest "start" of an option line to determine description spacing
  let maxLineStartLength = 0;
  // Iterate over options and create the "start" of each option (e.g. `  -b, --build-env <key=value>`)
  for (const option of command.options) {
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
    const option = command.options[i];
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
          MAX_LINE_LENGTH
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
    // add an empty line in between in each option block for readability (skip the last block)
    if (i !== optionLines.length - 1) outputArray.push('');
  }

  // return the entire list of options as a single string after delete the last '\n' added to the option list
  const outputString = outputArrayToString(outputArray);
  return outputString.substring(0, outputString.length - 1);
}

function buildCommandExampleLines(command: Command) {
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
  // delete the last newline appended to the last example line
  const outputString = outputArrayToString(outputArray);
  return outputString.substring(0, outputString.length - 1);
}

function buildHelpOutput(command: Command) {
  const outputArray: string[] = [
    buildCommandSynopsisLine(command),
    '',
    command.description,
    '',
    buildCommandOptionLines(command),
    '',
    buildCommandExampleLines(command),
  ];

  return outputArrayToString(outputArray);
}

export function help(command: Command) {
  return buildHelpOutput(command);
}
