// Packages
import chalk from 'chalk';

// Utilities
import Client from '../../util/client';
import listInput from '../../util/input/list';
import getUser from '../../util/get-user';
import getTeams from '../../util/get-teams';
import { Team, GlobalConfig } from '../../types';
import { writeToConfigFile } from '../../util/config/files';

const updateCurrentTeam = (config: GlobalConfig, team?: Team) => {
  if (team) {
    config.currentTeam = team.id;
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

  const currentTeam = personalScopeSelected
    ? undefined
    : teams.find(team => team.id === config.currentTeam);

  if (!personalScopeSelected && !currentTeam) {
    output.error(`You are not a part of the current team anymore`);
    return 1;
  }

  if (!desiredSlug) {
    const teamChoices = teams
      .slice(0)
      .sort((a, b) => {
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      })
      .map(({ id, slug, name }) => {
        let title = `${slug} (${name})`;
        const selected = id === currentTeam?.id;

        if (selected) {
          title += ` ${chalk.bold('(current)')}`;
        }

        return {
          name: title,
          value: slug,
          short: slug,
          selected,
        };
      });

    // Add the User scope entry at the top
    const suffix = personalScopeSelected ? ` ${chalk.bold('(current)')}` : '';

    const userTitle = user.username
      ? `${user.username} (${user.email})${suffix}`
      : user.email;

    const choices = [
      { separator: 'Personal Account' },
      {
        name: userTitle,
        value: user.email,
        short: user.username,
        selected: personalScopeSelected,
      },
      { separator: 'Teams' },
      ...teamChoices,
    ];

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

  if (desiredSlug === user.username || desiredSlug === user.email) {
    // Switch to user's personal account
    if (personalScopeSelected) {
      output.log('No changes made');
      return 0;
    }

    updateCurrentTeam(config);

    output.success(`Your account (${chalk.bold(desiredSlug)}) is now active!`);
    return 0;
  }

  // Switch to selected team
  const newTeam = teams.find(team => team.slug === desiredSlug);

  if (!newTeam) {
    output.error(
      `You do not have permission to access scope ${chalk.bold(desiredSlug)}`
    );
    return 1;
  }

  if (newTeam.slug === currentTeam?.slug) {
    output.log('No changes made');
    return 0;
  }

  updateCurrentTeam(config, newTeam);

  output.success(
    `The team ${chalk.bold(newTeam.name)} (${newTeam.slug}) is now active!`
  );
  return 0;
}
