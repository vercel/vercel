import chalk from 'chalk';
import ms from 'ms';
import Client from '../../util/client';
import { getCommandName } from '../../util/pkg-name';

const e = encodeURIComponent;

export default async function rm(client: Client, args: string[]) {
  if (args.length !== 1) {
    client.output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        `${getCommandName('project rm <name>')}`
      )}`
    );
    return 1;
  }

  const name = args[0];

  const start = Date.now();

  const yes = await readConfirmation(name);
  if (!yes) {
    client.output.log('User abort');
    return 0;
  }

  try {
    await client.fetch(`/v2/projects/${e(name)}`, {
      method: 'DELETE',
    });
  } catch (err) {
    if (err.status === 404) {
      client.output.error('No such project exists');
      return 1;
    }
  }
  const elapsed = ms(Date.now() - start);
  console.log(
    `${chalk.cyan('> Success!')} Project ${chalk.bold(
      name
    )} removed ${chalk.gray(`[${elapsed}]`)}`
  );
  return;
}

function readConfirmation(projectName: string) {
  return new Promise(resolve => {
    process.stdout.write(
      `The project: ${chalk.bold(projectName)} will be removed permanently.\n` +
        `It will also delete everything under the project including deployments.\n`
    );

    process.stdout.write(
      `${chalk.bold.red('> Are you sure?')} ${chalk.gray('[y/N] ')}`
    );

    process.stdin
      .on('data', d => {
        process.stdin.pause();
        resolve(d.toString().trim().toLowerCase() === 'y');
      })
      .resume();
  });
}
