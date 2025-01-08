import chalk from 'chalk';
import stamp from '../../util/output/stamp';
import eraseLines from '../../util/output/erase-lines';
import chars from '../../util/output/chars';
import invite from './invite';
import { writeToConfigFile } from '../../util/config/files';
import { getCommandName } from '../../util/pkg-name';
import type Client from '../../util/client';
import createTeam from '../../util/teams/create-team';
import patchTeam from '../../util/teams/patch-team';
import { errorToString, isError } from '@vercel/error-utils';
import output from '../../output-manager';

const validateSlug = (value: string) => /^[a-z]+[a-z0-9_-]*$/.test(value);
const validateName = (value: string) => /^[ a-zA-Z0-9_-]+$/.test(value);

const teamUrlPrefix = 'Team URL'.padEnd(14) + chalk.gray('vercel.com/');
const teamNamePrefix = 'Team Name'.padEnd(14);

export default async function add(client: Client): Promise<number> {
  let slug;
  let team;
  let elapsed;

  output.log(
    `Pick a team identifier for its URL (e.g.: ${chalk.cyan(
      '`vercel.com/acme`'
    )})`
  );
  do {
    try {
      // eslint-disable-next-line no-await-in-loop
      slug = await client.input.text({
        message: `- ${teamUrlPrefix}`,
        validate: validateSlug,
        default: slug,
      });
    } catch (err: unknown) {
      if (isError(err) && err.message === 'USER_ABORT') {
        output.log('Canceled');
        return 0;
      }

      throw err;
    }

    elapsed = stamp();
    output.spinner(teamUrlPrefix + slug);

    try {
      // eslint-disable-next-line no-await-in-loop
      team = await createTeam(client, { slug });
    } catch (err: unknown) {
      output.stopSpinner();
      output.print(eraseLines(2));
      output.error(errorToString(err));
    }
  } while (!team);

  output.stopSpinner();
  process.stdout.write(eraseLines(2));

  output.success(`Team created ${elapsed()}`);
  output.log(`${chalk.cyan(`${chars.tick} `) + teamUrlPrefix + slug}\n`);
  output.log('Pick a display name for your team');

  let name;

  try {
    name = await client.input.text({
      message: `- ${teamNamePrefix}`,
      validate: validateName,
    });
  } catch (err: unknown) {
    if (isError(err) && err.message === 'USER_ABORT') {
      output.log('No name specified');
      return 2;
    }

    throw err;
  }

  elapsed = stamp();
  output.spinner(teamNamePrefix + name);

  const res = await patchTeam(client, team.id, { name });

  output.stopSpinner();
  process.stdout.write(eraseLines(2));

  team = Object.assign(team, res);

  output.success(`Team name saved ${elapsed()}`);
  output.log(`${chalk.cyan(`${chars.tick} `) + teamNamePrefix + team.name}\n`);

  // Update config file
  output.spinner('Saving');
  client.config.currentTeam = team.id;
  writeToConfigFile(client.config);
  output.stopSpinner();

  await invite(client, [], {
    introMsg: 'Invite your teammates! When done, press enter on an empty field',
    noopMsg: `You can invite teammates later by running ${getCommandName(
      `teams invite`
    )}`,
  });

  return 0;
}
