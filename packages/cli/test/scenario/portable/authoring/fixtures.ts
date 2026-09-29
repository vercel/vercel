/** Shared fixture entities. Values mirror what the API and files contain. */
import type { App, Team, User } from '../model/schemas';

export const scenarioToken = 'scenario_token';

const created = '2017-04-29T17:21:54.514Z';

export const scenarioUser = {
  id: 'user_scenario',
  email: 'scenario@example.test',
  name: 'Scenario User',
  username: 'scenario-user',
} satisfies User;

export const globalTeam = {
  id: 'team_global',
  slug: 'global-team',
  name: 'Global Team',
  creatorId: 'user_scenario',
  created,
  avatar: null,
} satisfies Team;

export const localTeam = {
  id: 'team_local',
  slug: 'local-team',
  name: 'Local Team',
  creatorId: 'user_scenario',
  created,
  avatar: null,
} satisfies Team;

export const virtualTeam = {
  id: 'team_virtual',
  slug: 'virtual-team',
  name: 'Virtual Team',
  creatorId: 'user_other',
  created,
  avatar: null,
} satisfies Team;

export const northstarDefaultTeam = {
  id: 'team_northstar_default',
  slug: 'northstar-default',
  name: 'Northstar Default',
  creatorId: 'user_northstar',
  created,
  avatar: null,
} satisfies Team;

export const northstarUser = {
  id: 'user_northstar',
  email: 'northstar@example.test',
  name: 'Northstar User',
  username: 'northstar-user',
  version: 'northstar',
  defaultTeamId: 'team_northstar_default',
} satisfies User;

/** A team whose slug collides with the Northstar user's username. */
export const northstarUsernameTeam = {
  id: 'team_northstar_username',
  slug: 'northstar-user',
  name: 'Northstar Username Team',
  creatorId: 'user_northstar',
  created,
  avatar: null,
} satisfies Team;

export const scenarioAppId = 'app_scenario';

export const scenarioApp = {
  clientId: 'app_scenario',
  clientName: 'Scenario App',
  teamId: 'team_global',
} satisfies App;
