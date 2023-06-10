import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import { LOGO, NAME } from '@vercel-internals/constants';

const INDENT = ' '.repeat(2);
const NEWLINE = '\n';
const MAX_LINE_LENGTH = process.stdout.columns;

interface CommandOption {
  name: string;
  shorthand: string | null;
  type: string;
  argument?: string;
  deprecated: boolean;
  description: string;
}
interface CommandArgument {
  name: string;
  required: boolean;
}
interface CommandExample {
  name: string;
  value: string | string[];
}
interface Command {
  name: string;
  description: string;
  arguments: CommandArgument[];
  options: CommandOption[];
  examples: CommandExample[];
}
const commands: Command[] = [
  {
    name: 'deploy',
    description:
      'Deploy your project to Vercel. The `deploy` command is the default command for the Vercel CLI, and can be omitted (`vc deploy my-app` equals `vc my-app`).',
    arguments: [
      {
        name: 'project-path',
        required: false,
      },
    ],
    options: [
      {
        name: 'force',
        shorthand: 'f',
        type: 'boolean',
        deprecated: false,
        description: 'Force a new deployment even if nothing has changed',
      },
      {
        name: 'with-cache',
        shorthand: null,
        type: 'boolean',
        deprecated: false,
        description: 'Retain build cache when using "--force"',
      },
      {
        name: 'public',
        shorthand: 'p',
        type: 'boolean',
        deprecated: false,
        description: `Deployment is public (${chalk.dim(
          '`/_src`'
        )} is exposed)`,
      },
      {
        name: 'env',
        shorthand: 'e',
        type: 'array-string',
        argument: 'key=value',
        deprecated: false,
        description: `Specify environment variables during ${chalk.bold(
          'run-time'
        )} (e.g. ${chalk.dim('`-e KEY1=value1 -e KEY2=value2`')})`,
      },
      {
        name: 'build-env',
        shorthand: 'b',
        type: 'array-string',
        argument: 'key=value',
        deprecated: false,
        description: `Specify environment variables during ${chalk.bold(
          'build-time'
        )} (e.g. ${chalk.dim('`-b KEY1=value1 -b KEY2=value2`')})`,
      },
      {
        name: 'meta',
        shorthand: 'm',
        type: 'array-string',
        argument: 'key=value',
        deprecated: false,
        description: `Specify metadata for the deployment (e.g. ${chalk.dim(
          '`-m KEY1=value1 -m KEY2=value2`'
        )})`,
      },
      {
        name: 'regions',
        shorthand: null,
        type: 'string',
        deprecated: false,
        description: 'Set default regions to enable the deployment on',
      },
      {
        name: 'prebuilt',
        shorthand: null,
        type: 'boolean',
        deprecated: false,
        description: 'TODO: Description for --prebuilt',
      },
      {
        name: 'prod',
        shorthand: null,
        type: 'boolean',
        deprecated: false,
        description: 'Create a production deployment',
      },
      {
        name: 'archive',
        shorthand: null,
        type: 'string',
        deprecated: false,
        description: 'TODO: Description for --archive',
      },
      {
        name: 'no-wait',
        shorthand: null,
        type: 'boolean',
        deprecated: false,
        description: "Don't wait for the deployment to finish",
      },
      {
        name: 'skip-domain',
        shorthand: null,
        type: 'boolean',
        deprecated: false,
        description: 'TODO: Description for --skip-domain',
      },
      {
        name: 'yes',
        shorthand: 'y',
        type: 'boolean',
        deprecated: false,
        description: 'TODO: Description for --yes',
      },
      {
        name: 'name',
        shorthand: 'n',
        type: 'string',
        deprecated: true,
        description: 'TODO: Description for --name',
      },
      {
        name: 'no-clipboard',
        shorthand: null,
        type: 'boolean',
        deprecated: true,
        description: 'TODO: Description for --no-clipboard',
      },
      {
        name: 'target',
        shorthand: null,
        type: 'string',
        deprecated: true,
        description: 'TODO: Description for --target',
      },
      {
        name: 'confirm',
        shorthand: 'c',
        type: 'boolean',
        deprecated: true,
        description: 'TODO: Description for --confirm',
      },
    ],
    examples: [
      {
        name: 'Deploy the current directory',
        value: 'vercel',
      },
      {
        name: 'Deploy a custom path',
        value: 'vercel /usr/src/project',
      },
      {
        name: 'Deploy with run-time Environment Variables',
        value: 'vercel -e NODE_ENV=production',
      },
      {
        name: 'Deploy with prebuilt outputs',
        value: ['vercel build', 'vercel deploy --prebuilt'],
      },
      {
        name: 'Write Deployment URL to a file',
        value: 'vercel > deployment-url.txt',
      },
    ],
  },
];

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
      const curr = line[i]!;
      const next = line[i + 1]!;
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
    maxLineStartLength =
      lineLength > maxLineStartLength ? lineLength : maxLineStartLength;
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
    for (const descriptionWord of option.description.split(' ')) {
      // insert a new line when the next word would match or exceed the maximum line length
      if (
        calcLineLength(lines[lines.length - 1]) +
          stripAnsi(descriptionWord).length >
        MAX_LINE_LENGTH
      ) {
        // initialize the new line with the necessary whitespace. The INDENT is apart of `maxLineStartLength`
        lines.push([' '.repeat(maxLineStartLength + 2)]);
      }
      // insert the word to the current last line
      lines[lines.length - 1].push(descriptionWord);
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

function builder(command: (typeof commands)[number]) {
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

export function help(commandName: string) {
  const command = commands.find(command => command.name === commandName);
  if (!command) {
    throw new Error(`Undefined command: ${commandName}`);
  }
  return builder(command);
}

console.log(help('deploy'));
