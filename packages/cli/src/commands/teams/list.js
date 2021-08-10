import chars from '../../util/output/chars';
import table from '../../util/output/table';
import getUser from '../../util/get-user.ts';
import getPrefixedFlags from '../../util/get-prefixed-flags';
import { getPkgName } from '../../util/pkg-name.ts';
import getCommandFlags from '../../util/get-command-flags';
import cmd from '../../util/output/cmd.ts';

export default async function list(client, argv, teams) {
  const { config, output } = client;
  const { next } = argv;

  if (typeof next !== 'undefined' && !Number.isInteger(next)) {
    output.error('Please provide a number for flag --next');
    return 1;
  }

  output.spinner('Fetching teams');
  const { teams: list, pagination } = await teams.ls({
    next,
    apiVersion: 2,
  });
  let { currentTeam } = config;
  const accountIsCurrent = !currentTeam;

  output.spinner('Fetching user information');
  let user;
  try {
    user = await getUser(client);
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  if (accountIsCurrent) {
    currentTeam = {
      slug: user.username || user.email,
    };
  }

  const teamList = list.map(({ slug, name }) => ({
    name,
    value: slug,
    current: slug === currentTeam.slug ? chars.tick : '',
  }));

  teamList.unshift({
    name: user.email,
    value: user.username || user.email,
    current: (accountIsCurrent && chars.tick) || '',
  });

  // Let's bring the current team to the beginning of the list
  if (!accountIsCurrent) {
    const index = teamList.findIndex(
      choice => choice.value === currentTeam.slug
    );
    const choice = teamList.splice(index, 1)[0];
    teamList.unshift(choice);
  }

  // Printing
  const count = teamList.length;
  if (!count) {
    // Maybe should not happen
    output.error(`No teams found`);
    return 1;
  }

  output.stopSpinner();
  console.log(); // empty line

  table(
    ['', 'id', 'email / name'],
    teamList.map(team => [team.current, team.value, team.name]),
    [1, 5]
  );

  if (pagination && pagination.count === 20) {
    const prefixedArgs = getPrefixedFlags(argv);
    const flags = getCommandFlags(prefixedArgs, ['_', '--next', '-N', '-d']);
    const nextCmd = `${getPkgName()} teams ls${flags} --next ${
      pagination.next
    }`;
    console.log(); // empty line
    output.log(`To display the next page run ${cmd(nextCmd)}`);
  }
}
