import chars from '../../util/output/chars';
import table from '../../util/output/table';
import getUser from '../../util/get-user';
import getTeams from '../../util/teams/get-teams';
import getPrefixedFlags from '../../util/get-prefixed-flags';
import { getPkgName } from '../../util/pkg-name';
import getCommandFlags from '../../util/get-command-flags';
import cmd from '../../util/output/cmd';
import Client from '../../util/client';
import getArgs from '../../util/get-args';

export default async function list(client: Client): Promise<number> {
  const { config, output } = client;

  const argv = getArgs(client.argv.slice(2), {
    '--since': String,
    '--until': String,
    '--count': Number,
    '--next': Number,
    '-C': '--count',
    '-N': '--next',
  });

  const next = argv['--next'];
  const count = argv['--count'];

  if (typeof next !== 'undefined' && !Number.isInteger(next)) {
    output.error('Please provide a number for flag `--next`');
    return 1;
  }

  if (typeof count !== 'undefined' && !Number.isInteger(next)) {
    output.error('Please provide a number for flag `--count`');
    return 1;
  }

  output.spinner('Fetching teams');
  const { teams, pagination } = await getTeams(client, {
    next,
    apiVersion: 2,
  });
  let { currentTeam } = config;
  const accountIsCurrent = !currentTeam;

  output.spinner('Fetching user information');
  const user = await getUser(client);

  if (accountIsCurrent) {
    currentTeam = user.id;
  }

  const teamList = teams.map(({ id, slug, name }) => ({
    id,
    name,
    value: slug,
    current: id === currentTeam ? chars.tick : '',
  }));

  teamList.unshift({
    id: user.id,
    name: user.email,
    value: user.username || user.email,
    current: accountIsCurrent ? chars.tick : '',
  });

  // Bring the current Team to the beginning of the list
  if (!accountIsCurrent) {
    const index = teamList.findIndex(choice => choice.id === currentTeam);
    const choice = teamList.splice(index, 1)[0];
    teamList.unshift(choice);
  }

  // Printing
  output.stopSpinner();
  console.log(); // empty line

  table(
    ['', 'id', 'email / name'],
    teamList.map(team => [team.current, team.value, team.name]),
    [1, 5]
  );

  if (pagination?.count === 20) {
    const prefixedArgs = getPrefixedFlags(argv);
    const flags = getCommandFlags(prefixedArgs, ['_', '--next', '-N', '-d']);
    const nextCmd = `${getPkgName()} teams ls${flags} --next ${
      pagination.next
    }`;
    console.log(); // empty line
    output.log(`To display the next page run ${cmd(nextCmd)}`);
  }

  return 0;
}
