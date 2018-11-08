const getUser = require('./get-user');
const NowTeams = require('./teams');
const param = require('./output/param');

const loginCommand = param('now login');
const TokenError = new Error(
  `Your access token has been revoked. You can log in again using ${loginCommand}.`
);

TokenError.code = 'not_authorized';

const retrieveUser = async (apiUrl, token) => {
  let user = null;

  try {
    user = await getUser({ apiUrl, token });
  } catch (err) {
    if (err.code === 'not_authorized') {
      throw TokenError;
    }

    throw err;
  }

  return user;
};

const retrieveTeam = async (apiUrl, token, debug, currentTeam) => {
  let list = [];

  try {
    const teams = new NowTeams({ apiUrl, token, debug });
    list = (await teams.ls()).teams;
  } catch (err) {
    if (err.code === 'not_authorized') {
      throw TokenError;
    }

    throw err;
  }

  const related = list.find(team => team.id === currentTeam);

  if (!related) {
    const cmd = param('now switch');
    const error = new Error(
      `Your team was deleted. You can switch to a different one using ${cmd}.`
    );

    error.code = 'team_deleted';
    throw error;
  }

  return related;
};

const allowed = new Set([
  'user',
  'team'
]);

module.exports = async function getScope({
  apiUrl,
  token,
  debug,
  currentTeam,
  required = new Set()
}) {
  if (Array.from(required).find(item => !allowed.has(item))) {
    throw new Error('Only "user" and "team" are allowed inside `required`');
  }

  let team = null;
  let user = null;

  if (currentTeam) {
    required.add('team');
  } else {
    required.add('user');
  }

  if (required.has('team')) {
    team = await retrieveTeam(apiUrl, token, debug, currentTeam);
  }

  if (required.has('user')) {
    user = await retrieveUser(apiUrl, token);
  }

  // It's important to check for `currentTeam` here and not `team` because
  // we only want to prefer the team if the config file has current team set
  // and not if the function was asked to include it in the output.
  return {
    contextName: currentTeam ? team.slug : (user.username || user.email),
    platformVersion: currentTeam ? team.platformVersion : user.platformVersion,
    user,
    team
  };
};
