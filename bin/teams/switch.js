const chalk = require('chalk');

const wait = require('../../lib/utils/output/wait');
const listInput = require('../../lib/utils/input/list');
const cfg = require('../../lib/cfg');
const exit = require('../../lib/utils/exit');
const success = require('../../lib/utils/output/success');

module.exports = async function(teams, args) {
  let stopSpinner = wait('Fetching teams');
  const list = await teams.ls();
  let { user, currentTeam } = await cfg.read();
  stopSpinner();

  currentTeam = currentTeam || {
    slug: user.username || user.email
  };

  if (args.length !== 0) {
    return console.log(args);
  }

  const choices = list.map(({ slug, name }) => ({
    name: `${slug} (${name})`,
    value: slug,
    short: slug
  }));

  choices.unshift({
    name: `${user.username} (${user.email})`,
    value: user.username,
    short: user.username
  });

  let message;

  if (currentTeam) {
    message = `Your current context is "${chalk.bold(currentTeam.slug)}" `;
  }

  const choice = await listInput({
    message,
    choices,
    separator: false
  });

  // Abort
  if (!choice) {
    console.log('No changes made');
    return exit();
  }

  const newTeam = list.find(item => item.slug === choice);

  if (newTeam.slug === currentTeam.slug) {
    console.log('No changes made');
    return exit();
  }

  // The user selected his personal context
  if (!newTeam) {
    stopSpinner = wait('Saving');
    await cfg.remove('currentTeam');
    stopSpinner();
    return success(
      `Your personal context (${chalk.bold(choice)}) is now active!`
    );
  }

  stopSpinner = wait('Saving');
  await cfg.merge({ currentTeam: newTeam });
  stopSpinner();

  success(`The context ${chalk.bold(newTeam.name)} is now active!`);
};
