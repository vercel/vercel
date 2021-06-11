import chalk from 'chalk';
import stamp from '../../util/output/stamp.ts';
import info from '../../util/output/info';
import error from '../../util/output/error';
import wait from '../../util/output/wait';
import rightPad from '../../util/output/right-pad';
import eraseLines from '../../util/output/erase-lines';
import chars from '../../util/output/chars';
import success from '../../util/output/success';
import note from '../../util/output/note';
import textInput from '../../util/input/text';
import invite from './invite';
import { writeToConfigFile } from '../../util/config/files';
import { getPkgName, getCommandName } from '../../util/pkg-name.ts';

const validateSlugKeypress = (data, value) =>
  // TODO: the `value` here should contain the current value + the keypress
  // should be fixed on utils/input/text.js
  /^[a-zA-Z]+[a-zA-Z0-9_-]*$/.test(value + data);

const validateNameKeypress = (data, value) =>
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

const teamUrlPrefix = rightPad('Team URL', 14) + chalk.gray('vercel.com/');
const teamNamePrefix = rightPad('Team Name', 14);

export default async function add(client, teams) {
  let slug;
  let team;
  let elapsed;
  let stopSpinner;

  console.log(
    info(
      `Pick a team identifier for its url (e.g.: ${chalk.cyan(
        '`vercel.com/acme`'
      )})`
    )
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
    } catch (err) {
      if (err.message === 'USER_ABORT') {
        console.log(info('Aborted'));
        return 0;
      }

      throw err;
    }

    elapsed = stamp();
    stopSpinner = wait(teamUrlPrefix + slug);

    let res;
    try {
      // eslint-disable-next-line no-await-in-loop
      res = await teams.create({ slug });
      stopSpinner();
      team = res;
    } catch (err) {
      stopSpinner();
      process.stdout.write(eraseLines(2));
      console.error(error(err.message));
    }
  } while (!team);

  process.stdout.write(eraseLines(2));

  console.log(success(`Team created ${elapsed()}`));
  console.log(`${chalk.cyan(`${chars.tick} `) + teamUrlPrefix + slug}\n`);
  console.log(info('Pick a display name for your team'));

  let name;

  try {
    name = await textInput({
      label: `- ${teamNamePrefix}`,
      validateKeypress: validateNameKeypress,
    });
  } catch (err) {
    if (err.message === 'USER_ABORT') {
      console.log(info('No name specified'));
      return gracefulExit();
    }

    throw err;
  }

  elapsed = stamp();
  stopSpinner = wait(teamNamePrefix + name);

  const res = await teams.edit({ id: team.id, name });

  stopSpinner();

  process.stdout.write(eraseLines(2));

  if (res.error) {
    console.error(error(res.error.message));
    console.log(`${chalk.red(`✖ ${teamNamePrefix}`)}${name}`);

    return 1;
    // TODO: maybe we want to ask the user to retry? not sure if
    // there's a scenario where that would be wanted
  }

  team = Object.assign(team, res);

  console.log(success(`Team name saved ${elapsed()}`));
  console.log(`${chalk.cyan(`${chars.tick} `) + teamNamePrefix + team.name}\n`);

  stopSpinner = wait('Saving');

  // Update config file
  const configCopy = Object.assign({}, client.config);

  if (configCopy.sh) {
    configCopy.sh.currentTeam = team;
  } else {
    configCopy.currentTeam = team.id;
  }

  writeToConfigFile(configCopy);

  stopSpinner();

  await invite(client, { _: [] }, teams, {
    introMsg: 'Invite your teammates! When done, press enter on an empty field',
    noopMsg: `You can invite teammates later by running ${getCommandName(
      `teams invite`
    )}`,
  });

  gracefulExit();
}
