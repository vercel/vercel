// Packages
import chalk from 'chalk';

// Utilities
import Client from '../../util/client';
import { emoji } from '../../util/emoji';
import getUser from '../../util/get-user';
import getTeams from '../../util/get-teams';
import getToken from '../../util/get-token';
import listInput from '../../util/input/list';
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

export default async function main(client: Client, desiredSlug?: string) {
  const { config, output } = client;
  const personalScopeSelected = !config.currentTeam;

  output.spinner('Fetching teams information');
  const [user, teams, token] = await Promise.all([
    getUser(client),
    getTeams(client),
    getToken(client),
  ]);

  const currentTeam = personalScopeSelected
    ? undefined
    : teams.find(team => team.id === config.currentTeam);

  if (!personalScopeSelected && !currentTeam) {
    output.error(`You are not a member of the current team anymore.`);
    return 1;
  }

  if (!desiredSlug) {
    const teamChoices = teams
      .slice(0)
      .sort((a, b) => {
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      })
      .map(team => {
        let title = `${team.name} (${team.slug})`;
        const selected = team.id === currentTeam?.id;

        if (selected) {
          title += ` ${chalk.bold('(current)')}`;
        }

        if (team.limited) {
          title += ` ${emoji('locked')}`;
        }

        return {
          name: title,
          value: team.slug,
          short: team.slug,
          selected,
        };
      });

    // Add the User scope entry at the top
    let suffix = personalScopeSelected ? ` ${chalk.bold('(current)')}` : '';

    // SAML tokens can not interact with the user scope
    if (token.type === 'token' && token.origin === 'saml') {
      suffix += ` ${emoji('locked')}`;
    }

    const choices = [
      { separator: 'Personal Account' },
      {
        name: `${user.email} (${user.username})${suffix}`,
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
      eraseFinalAnswer: true,
    });
  }

  // Abort
  if (!desiredSlug) {
    output.log('No changes made.');
    return 0;
  }

  if (desiredSlug === user.username || desiredSlug === user.email) {
    // Switch to user's personal account
    if (personalScopeSelected) {
      output.log('No changes made');
      return 0;
    }

    if (token.type === 'token' && token.origin === 'saml') {
      await client.reauthenticate({
        scope: user.username,
        teamId: null,
      });
    }

    updateCurrentTeam(config);

    output.success(`Your account (${chalk.bold(desiredSlug)}) is now active!`);
    return 0;
  }

  // Switch to selected team
  const newTeam = teams.find(team => team.slug === desiredSlug);

  if (!newTeam) {
    output.error(
      `You do not have permission to access scope ${chalk.bold(desiredSlug)}.`
    );
    return 1;
  }

  if (newTeam.slug === currentTeam?.slug) {
    output.log('No changes made');
    return 0;
  }

  if (newTeam.limited) {
    const samlEnabled = newTeam.saml?.connection?.state === 'active';
    await client.reauthenticate({
      teamId: samlEnabled ? newTeam.id : null,
      scope: newTeam.slug,
      enforced: samlEnabled && newTeam.saml?.enforced === true,
    });
  }

  updateCurrentTeam(config, newTeam);

  output.success(
    `The team ${chalk.bold(newTeam.name)} (${newTeam.slug}) is now active!`
  );
  return 0;
}
