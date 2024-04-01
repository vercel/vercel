import isErrnoException from '@vercel/error-utils';
import chalk from 'chalk';
import table from 'text-table';
import ms from 'ms';
import strlen from '../../util/strlen';
import { handleError, error } from '../../util/error';
import NowSecrets from '../../util/secrets';
import getScope from '../../util/get-scope';
import confirm from '../../util/input/confirm';
import getCommandFlags from '../../util/get-command-flags';
import { getCommandName } from '../../util/pkg-name';
import getArgs from '../../util/get-args';
import { help } from '../help';
import { secretsCommand } from './command';

// Options
let argv;
let subcommand;
let nextTimestamp;

const main = async client => {
  argv = getArgs(client.argv.slice(2), {
    '--yes': Boolean,
    '--next': Number,
    '--test-warning': Boolean,
    '-y': '--yes',
    '-N': '--next',
  });

  argv._ = argv._.slice(1);

  subcommand = argv._[0];
  nextTimestamp = argv.next;

  if (argv.help || !subcommand) {
    client.output.print(
      help(secretsCommand, { columns: client.stderr.columns })
    );
    return 2;
  }

  const {
    output,
    config: { currentTeam },
  } = client;
  let contextName = null;

  try {
    ({ contextName } = await getScope(client));
  } catch (err) {
    if (isErrnoException(err)) {
      if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
        output.error(err.message);
        return 1;
      }
    }

    throw err;
  }

  return run({ output, contextName, currentTeam, client });
};

export default async client => {
  try {
    return await main(client);
  } catch (err) {
    handleError(err);
    process.exit(1);
  }
};

async function run({ output, contextName, currentTeam, client }) {
  const secrets = new NowSecrets({ client, currentTeam });
  const args = argv._.slice(1);
  const start = Date.now();
  const { '--test-warning': testWarningFlag } = argv;

  const commandName = getCommandName('secret ' + subcommand);

  output.warn(
    'On May 1st, 2024 secrets will be automatically converted to sensitive Environment Variables for Preview and Production environments.\n' +
      'Secrets attached to Development environments will not be migrated.' +
      'See https://vercel.com/changelog/legacy-environment-variable-secrets-are-being-sunset for more information.'
  );

  if (subcommand === 'ls' || subcommand === 'list') {
    output.note(
      `The ${getCommandName(
        'env ls'
      )} command is recommended instead of ${commandName}\n`
    );
    if (args.length > 1) {
      // consider replacing with `output.error`
      console.error(
        error(
          `Invalid number of arguments. Usage: ${chalk.cyan(
            `${getCommandName('secret ls')}`
          )}`
        )
      );
      return 1;
    }

    const { secrets: list, pagination } = await secrets.ls(
      nextTimestamp,
      testWarningFlag
    );
    const elapsed = ms(Date.now() - start);

    output.print(
      `${list.length > 0 ? 'Secrets' : 'No secrets'} found under ${chalk.bold(
        contextName
      )} ${chalk.gray(`[${elapsed}]`)}\n`
    );

    if (list.length > 0) {
      const cur = Date.now();
      const header = [['', 'name', 'created'].map(s => chalk.dim(s))];
      const out = table(
        header.concat(
          list.map(secret => [
            '',
            chalk.bold(secret.name),
            chalk.gray(`${ms(cur - new Date(secret.created))} ago`),
          ])
        ),
        {
          align: ['l', 'l', 'l'],
          hsep: ' '.repeat(2),
          stringLength: strlen,
        }
      );

      if (out) {
        client.output.print(`\n${out}\n`);
      }
    }

    if (pagination && pagination.count === 20) {
      const flags = getCommandFlags(argv, ['_', '--next', '-N', '-d', '-y']);
      const nextCmd = `secrets ${subcommand}${flags} --next ${pagination.next}`;
      output.log(`To display the next page run ${getCommandName(nextCmd)}`);
    }
    return secrets.close();
  }

  if (subcommand === 'rm' || subcommand === 'remove') {
    output.note(
      `The ${getCommandName(
        'env rm'
      )} command is recommended instead of ${commandName}\n`
    );
    if (args.length !== 1) {
      // consider replacing with `output.error`
      console.error(
        error(
          `Invalid number of arguments. Usage: ${chalk.cyan(
            `${getCommandName('secret rm <name>')}`
          )}`
        )
      );
      return 1;
    }

    const theSecret = await secrets.getSecretByNameOrId(args[0]);

    if (theSecret) {
      const yes =
        argv['--yes'] ||
        (await readConfirmation(client, output, theSecret, contextName));
      if (!yes) {
        output.print(`Canceled. Secret not deleted.\n`);
        return 0;
      }
    } else {
      // consider replacing with `output.error`
      console.error(
        error(
          `No secret found by name "${args[0]}" under ${chalk.bold(
            contextName
          )}`
        )
      );
      return 1;
    }

    const secret = await secrets.rm(args[0]);
    const elapsed = ms(new Date() - start);
    output.success(
      `Secret ${chalk.bold(secret.name)} under ${chalk.bold(
        contextName
      )} removed ${chalk.gray(`[${elapsed}]`)}`
    );
    return secrets.close();
  }

  if (subcommand === 'rename') {
    output.note(
      `The ${getCommandName('env rm')} and ${getCommandName(
        'env add'
      )} commands are recommended instead of ${commandName}\n`
    );
    if (args.length !== 2) {
      // consider replacing with `output.error`
      console.error(
        error(
          `Invalid number of arguments. Usage: ${chalk.cyan(
            `${getCommandName('secret rename <old-name> <new-name>')}`
          )}`
        )
      );
      return 1;
    }
    const secret = await secrets.rename(args[0], args[1]);
    const elapsed = ms(new Date() - start);
    output.success(
      `Secret ${chalk.bold(secret.oldName)} renamed to ${chalk.bold(
        args[1]
      )} under ${chalk.bold(contextName)} ${chalk.gray(`[${elapsed}]`)}`
    );
    return secrets.close();
  }

  if (subcommand === 'add' || subcommand === 'set') {
    output.note(
      `The ${getCommandName(
        'env add'
      )} command is recommended instead of ${commandName}\n`
    );
    if (args.length !== 2) {
      // consider replacing with `output.error`
      console.error(
        error(
          `Invalid number of arguments. Usage: ${chalk.cyan(
            `${getCommandName('secret add <name> <value>')}`
          )}`
        )
      );

      if (args.length > 2) {
        const example = chalk.cyan(
          `$ ${getCommandName('secret add -- "${args[0]}"')}`
        );
        output.log(
          `If your secret has spaces or starts with '-', make sure to terminate command options with double dash and wrap it in quotes. Example: \n  ${example} `
        );
      }

      return 1;
    }

    const [name, value] = args;

    if (typeof value === 'boolean') {
      const example = chalk.cyan(
        `$ ${getCommandName('secret add -- "${name}"')}`
      );
      output.log(
        `If your secret starts with '-', make sure to terminate command options with double dash and wrap it in quotes. Example: \n  ${example} `
      );
      return 1;
    }

    await secrets.add(name, value);
    const elapsed = ms(new Date() - start);

    if (name !== name.toLowerCase()) {
      output.warn(`Your secret name was converted to lower-case`);
    }

    output.success(
      `Secret ${chalk.bold(name.toLowerCase())} added under ${chalk.bold(
        contextName
      )} ${chalk.gray(`[${elapsed}]`)}`
    );
    return secrets.close();
  }

  // consider replacing with `output.error`
  console.error(
    error('Please specify a valid subcommand: ls | add | rename | rm')
  );
  client.output.print(help(secretsCommand, { columns: client.stderr.columns }));
  return 2;
}

async function readConfirmation(client, output, secret, contextName) {
  const time = chalk.gray(`${ms(new Date() - new Date(secret.created))} ago`);
  const tbl = table([[chalk.bold(secret.name), time]], {
    align: ['r', 'l'],
    hsep: ' '.repeat(6),
  });

  output.print(
    `The following secret will be removed permanently from ${chalk.bold(
      contextName
    )}\n`
  );
  output.print(`  ${tbl}\n`);

  return confirm(client, `${chalk.bold.red('Are you sure?')}`, false);
}
