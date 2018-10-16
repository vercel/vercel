// Packages
const chalk = require('chalk');

// Utilities
const stamp = require('../../util/output/stamp');
const info = require('../../util/output/info');
const error = require('../../util/output/error');
const wait = require('../../util/output/wait');
const rightPad = require('../../util/output/right-pad');
const eraseLines = require('../../util/output/erase-lines');
const { tick } = require('../../util/output/chars');
const success = require('../../util/output/success');
const cmd = require('../../util/output/cmd');
const note = require('../../util/output/note');
const textInput = require('../../util/input/text');
const invite = require('./invite');
const { writeToConfigFile } = require('../../util/config/files');

const validateSlugKeypress = (data, value) => {
  // TODO: the `value` here should contain the current value + the keypress
  // should be fixed on utils/input/text.js
  return /^[a-zA-Z]+[a-zA-Z0-9_-]*$/.test(value + data);
};

const validateNameKeypress = (data, value) =>
  // TODO: the `value` here should contain the current value + the keypress
  // should be fixed on utils/input/text.js
  /^[ a-zA-Z0-9_-]+$/.test(value + data);

const gracefulExit = () => {
  console.log(); // Blank line
  note(
    `Your team is now active for all ${cmd('now')} commands!\n  Run ${cmd(
      'now switch'
    )} to change it in the future.`
  );
  return 0;
};

const teamUrlPrefix = rightPad('Team URL', 14) + chalk.gray('zeit.co/');
const teamNamePrefix = rightPad('Team Name', 14);

module.exports = async function({ teams, config }) {
  let slug;
  let team;
  let elapsed;
  let stopSpinner;

  console.log(
    info(
      `Pick a team identifier for its url (e.g.: ${chalk.cyan(
        '`zeit.co/acme`'
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
        forceLowerCase: true
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
  console.log(chalk.cyan(`${tick} `) + teamUrlPrefix + slug + '\n');

  console.log(info('Pick a display name for your team'));
  let name;
  try {
    name = await textInput({
      label: `- ${teamNamePrefix}`,
      validateKeypress: validateNameKeypress
    });
  } catch (err) {
    if (err.message === 'USER_ABORT') {
      console.log(info('No name specified'));
      return gracefulExit();
    } else {
      throw err;
    }
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
  console.log(chalk.cyan(`${tick} `) + teamNamePrefix + team.name + '\n');

  stopSpinner = wait('Saving');

  // Update config file
  const configCopy = Object.assign({}, config);
  configCopy.sh.currentTeam = team;
  writeToConfigFile(configCopy);

  stopSpinner();

  await invite({
    teams,
    args: [],
    config,
    introMsg: 'Invite your teammates! When done, press enter on an empty field',
    noopMsg: `You can invite teammates later by running ${cmd(
      'now teams invite'
    )}`
  });

  gracefulExit();
};
