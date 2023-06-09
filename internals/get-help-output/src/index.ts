import chalk from 'chalk';
import { LOGO, NAME } from '@vercel-internals/constants';

const INDENT = '  ';

interface CommandOption {
  name: string;
  shorthand: string | null;
  type: string;
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
    description: 'Deploy your project to Vercel. The `deploy` command is the default command for the Vercel CLI, and can be omitted (`vc deploy my-app` equals `vc my-app`).',
    arguments: [
      {
        name: 'project-path',
        required: false
      }
    ],
    options: [
      {
        'name': 'force',
        'shorthand': 'f',
        'type': 'boolean',
        'deprecated': false,
        'description': 'Force a new deployment even if nothing has changed',
      },
      {
        'name': 'with-cache',
        'shorthand': null,
        'type': 'boolean',
        'deprecated': false,
        'description': 'Retain build cache when using "--force"',
      },
      {
        'name': 'public',
        'shorthand': 'p',
        'type': 'boolean',
        'deprecated': false,
        'description': `Deployment is public (${chalk.dim('`/_src`')} is exposed)`,
      },
      {
        'name': 'env',
        'shorthand': 'e',
        'type': 'array-string',
        'deprecated': false,
        'description': `Specify environment variables during ${chalk.bold('run-time')} (e.g. ${chalk.dim('`-e KEY1=value1 -e KEY2=value2`')})`,
      },
      {
        'name': 'build-env',
        'shorthand': 'b',
        'type': 'array-string',
        'deprecated': false,
        'description': `Specify environment variables during ${chalk.bold('build-time')} (e.g. ${chalk.dim('`-b KEY1=value1 -b KEY2=value2`')})`,
      },
      {
        'name': 'meta',
        'shorthand': 'm',
        'type': 'array-string',
        'deprecated': false,
        'description': `Specify metadata for the deployment (e.g. ${chalk.dim('`-m KEY1=value1 -m KEY2=value2`')})`,
      },
      {
        'name': 'regions',
        'shorthand': null,
        'type': 'string',
        'deprecated': false,
        'description': 'Set default regions to enable the deployment on',
      },
      {
        'name': 'prebuilt',
        'shorthand': null,
        'type': 'boolean',
        'deprecated': false,
        'description': 'TODO: Description for --prebuilt',
      },
      {
        'name': 'prod',
        'shorthand': null,
        'type': 'boolean',
        'deprecated': false,
        'description': 'Create a production deployment',
      },
      {
        'name': 'archive',
        'shorthand': null,
        'type': 'string',
        'deprecated': false,
        'description': 'TODO: Description for --archive',
      },
      {
        'name': 'no-wait',
        'shorthand': null,
        'type': 'boolean',
        'deprecated': false,
        'description': 'Don\'t wait for the deployment to finish',
      },
      {
        'name': 'skip-domain',
        'shorthand': null,
        'type': 'boolean',
        'deprecated': false,
        'description': 'TODO: Description for --skip-domain',
      },
      {
        'name': 'yes',
        'shorthand': 'y',
        'type': 'boolean',
        'deprecated': false,
        'description': 'TODO: Description for --yes',
      },
      {
        'name': 'name',
        'shorthand': 'n',
        'type': 'string',
        'deprecated': true,
        'description': 'TODO: Description for --name',
      },
      {
        'name': 'no-clipboard',
        'shorthand': null,
        'type': 'boolean',
        'deprecated': true,
        'description': 'TODO: Description for --no-clipboard',
      },
      {
        'name': 'target',
        'shorthand': null,
        'type': 'string',
        'deprecated': true,
        'description': 'TODO: Description for --target',
      },
      {
        'name': 'confirm',
        'shorthand': 'c',
        'type': 'boolean',
        'deprecated': true,
        'description': 'TODO: Description for --confirm',
      },
    ],
    examples: [
      {
        name: 'Deploy the current directory',
        value: 'vercel'
      },
      {
        name: 'Deploy a custom path',
        value: 'vercel /usr/src/project'
      },
      {
        name: 'Deploy with run-time Environment Variables',
        value: 'vercel -e NODE_ENV=production'
      },
      {
        name: 'Deploy with prebuilt outputs',
        value: [
          'vercel build',
          'vercel deploy --prebuilt'
        ]
      },
      {
        name: 'Write Deployment URL to a file',
        value: 'vercel > deployment-url.txt'
      }
    ]
  }
];

/**
 * Example: `▲ vercel deploy [path] [options]`
 * @param command
 * @returns
 */
function buildCommandSynopsisLine (command: Command) {
  const line = [
    LOGO,
    chalk.bold(NAME),
    chalk.bold(command.name),
  ];
  if (command.arguments.length > 0) {
    for (const argument of command.arguments) {
      line.push(argument.required ? argument.name : `[${argument.name}]`)
    }
  }
  if (command.options.length > 0) {
    line.push('[options]');
  }
  return line.join(` `);
}

function buildCommandOptionLines (command: Command) {
  const out = [
    chalk.dim(`Options:`),
    ``,
  ]
  const spacing = 32;
  command.options.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const option of command.options) {
    const line = [INDENT];
    if (option.shorthand) {
      line.push(`-${option.shorthand}, `);
    }
    line.push(`--${option.name}`);
    line.push(' '.repeat(spacing - line.join('').length));
    line.push(option.description);
    out.push(line.join(''));
  }
  return out.join('\n');
}

function buildCommandExampleLines (command: Command) {
  const out = [
    chalk.dim(`Examples:`),
    ``,
  ];
  for (const example of command.examples) {
    const nameLine = [INDENT];
    nameLine.push(chalk.gray('- '));
    nameLine.push(example.name);
    out.push(nameLine.join(''));
    out.push('');
    const valueLine = (value: string) => `${INDENT.repeat(2)}${chalk.cyan(`$ ${value}`)}`;
    if (Array.isArray(example.value)) {
      for (const line of example.value) {
        out.push(valueLine(line));
      }
    } else {
      out.push(valueLine(example.value));
    }
    out.push('');
  }
  return out.join('\n');
}

export function wrap (input: string, limit?: number) {
  if (!limit) return input;
  const split = input.split(' ');
  const result: string[][] = [[]];
  let count = 0;
  let resultIter = 0;
  for (let i = 0; i < split.length; i++) {
    const item = split[i];
    if (!item) break;
    if (count + item.length > limit) {
      count = 0;
      resultIter++;
      result.push([]);
    }

    result[resultIter]?.push(item);
    count += item.length;
  }
  return result.map(line => line.join(' ')).join('\n');
}

function builder (command: typeof commands[number], wrapLimit = 60) {
  const out = [
    buildCommandSynopsisLine(command),
    ``,
    wrap(command.description, wrapLimit),
    ``,
    buildCommandOptionLines(command),
    ``,
    buildCommandExampleLines(command),
  ];

  return out.join('\n');
}

export function help (commandName: string) {
  const command = commands.find((command) => command.name === commandName);
  if (!command) {
    throw new Error(`Undefined command: ${commandName}`)
  }
  return builder(command);
}

console.log(help('deploy'));

/*

Vercel CLI 30.2.1

▲ vercel [deploy] [path-to-project] [options]

Deploy your project to Vercel. The `deploy` command is the default command for
the Vercel CLI, and can be omitted (`vc deploy my-app` equals `vc my-app`).

Options:

--prod                Create a production deployment

-p, --public          Deployment is public (`/_src` is exposed)

-e, --env             Specify environment variables during **run time**. Can be specified multiple times.
  Example: `-e KEY1=value1 -e KEY2=value2`

-b, --build-env       Specify environment variables during **build time**. Can be specified multiple times.
  Example: `-b KEY1=value1 -b KEY2=value2`

--no-wait             Don't wait for the deployment to finish before exiting


*/
