// Packages
import chalk from 'chalk';
import inquirer from 'inquirer';

// Utilities
import Client from '../../util/client';
import listInput from '../../util/input/list';
import getUser from '../../util/get-user';
import getTeams from '../../util/get-teams';
import { Team, GlobalConfig } from '../../types';
import { writeToConfigFile } from '../../util/config/files';

const updateCurrentTeam = (config: GlobalConfig, newTeam?: Team) => {
  if (newTeam) {
    config.currentTeam = newTeam.id;
  } else {
    delete config.currentTeam;
  }

  writeToConfigFile(config);
};

export default async function change(client: Client, desiredSlug?: string) {
  const { config, output } = client;
  const personalScopeSelected = !config.currentTeam;

  output.spinner('Fetching teams information');
  const [user, teams] = await Promise.all([getUser(client), getTeams(client)]);

  let currentTeam: Pick<Team, 'id' | 'slug'> | undefined;
  if (personalScopeSelected) {
    currentTeam = {
      id: '',
      slug: user.username || user.email,
    };
  } else {
    currentTeam = teams.find(team => team.id === config.currentTeam);

    if (!currentTeam) {
      output.error(`You are not a part of the current team anymore`);
      return 1;
    }
  }

  if (!desiredSlug) {
    const choices = teams
      .slice(0)
      .sort((a, b) => {
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      })
      .map(({ id, slug, name }) => {
        const selected = id === currentTeam!.id;
        name = `${slug} (${name})`;

        if (selected) {
          name += ` ${chalk.bold('(current)')}`;
        }

        return {
          name,
          value: slug,
          short: slug,
          selected,
        };
      });

    // Add the User scope entry at the top
    const suffix = personalScopeSelected ? ` ${chalk.bold('(current)')}` : '';

    const userEntryName = user.username
      ? `${user.username} (${user.email})${suffix}`
      : user.email;

    choices.unshift(new inquirer.Separator(`── Teams`));

    choices.unshift({
      name: userEntryName,
      value: user.email,
      short: user.username,
      selected: personalScopeSelected,
    });

    choices.unshift(new inquirer.Separator(`── Personal Account`));

    output.stopSpinner();
    desiredSlug = await listInput({
      message: 'Switch to:',
      choices,
      separator: false,
      eraseFinalAnswer: true,
    });
  }

  // Abort
  if (!desiredSlug) {
    output.log('No changes made');
    return 0;
  }

  const newTeam = teams.find(item => item.slug === desiredSlug);

  if (!newTeam) {
    // Switch to user's personal account
    if (currentTeam.slug === user.username || currentTeam.slug === user.email) {
      output.log('No changes made');
      return 0;
    }

    updateCurrentTeam(config);

    output.success(`Your account (${chalk.bold(desiredSlug)}) is now active!`);
    return 0;
  }

  if (newTeam.slug === currentTeam.slug) {
    output.log('No changes made');
    return 0;
  }

  updateCurrentTeam(config, newTeam);

  output.success(
    `The team ${chalk.bold(newTeam.name)} (${newTeam.slug}) is now active!`
  );
  return 0;
}
