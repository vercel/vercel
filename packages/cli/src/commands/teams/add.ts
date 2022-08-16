import chalk from 'chalk';
import stamp from '../../util/output/stamp';
import info from '../../util/output/info';
import eraseLines from '../../util/output/erase-lines';
import chars from '../../util/output/chars';
import note from '../../util/output/note';
import textInput from '../../util/input/text';
import invite from './invite';
import { writeToConfigFile } from '../../util/config/files';
import { getPkgName, getCommandName } from '../../util/pkg-name';
import Client from '../../util/client';
import createTeam from '../../util/teams/create-team';
import patchTeam from '../../util/teams/patch-team';
import { errorToString, isError } from '../../util/is-error';

const validateSlugKeypress = (data: string, value: string) =>
  // TODO: the `value` here should contain the current value + the keypress
  // should be fixed on utils/input/text.js
  /^[a-zA-Z]+[a-zA-Z0-9_-]*$/.test(value + data);

const validateNameKeypress = (data: string, value: string) =>
  // TODO: the `value` here should contain the current value + the keypress
  // should be fixed on utils/input/text.js
  /^[ a-zA-Z0-9_-]+$/.test(value + data);

const gracefulExit = () => {
  console.log(); // Blank line
  note(
    `Your team is now active for all ${getPkgName()} commands!\n  Run ${getCommandName(
      `switch`
    )} to change it in the future.`
  );
  return 0;
};

const teamUrlPrefix = 'Team URL'.padEnd(14) + chalk.gray('vercel.com/');
const teamNamePrefix = 'Team Name'.padEnd(14);

export default async function add(client: Client): Promise<number> {
  let slug;
  let team;
  let elapsed;
  const { output } = client;

  output.log(
    `Pick a team identifier for its URL (e.g.: ${chalk.cyan(
      '`vercel.com/acme`'
    )})`
  );
  do {
    try {
      // eslint-disable-next-line no-await-in-loop
      slug = await textInput({
        label: `- ${teamUrlPrefix}`,
        validateKeypress: validateSlugKeypress,
        initialValue: slug,
        valid: team,
        forceLowerCase: true,
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
    name = await textInput({
      label: `- ${teamNamePrefix}`,
      validateKeypress: validateNameKeypress,
    });
  } catch (err: unknown) {
    if (isError(err) && err.message === 'USER_ABORT') {
      console.log(info('No name specified'));
      return gracefulExit();
    }

    throw err;
  }

  elapsed = stamp();
  output.spinner(teamNamePrefix + name);

  const res = await patchTeam(client, team.id, { name });

  output.stopSpinner();
  process.stdout.write(eraseLines(2));

  /*
  if (res.error) {
    output.error(res.error.message);
    output.log(`${chalk.red(`✖ ${teamNamePrefix}`)}${name}`);

    return 1;
    // TODO: maybe we want to ask the user to retry? not sure if
    // there's a scenario where that would be wanted
  }
  */

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

  return gracefulExit();
}
