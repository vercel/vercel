import chars from '../../util/output/chars.js';
import table from '../../util/output/table.js';
import getUser from '../../util/get-user.js';
import getTeams from '../../util/teams/get-teams.js';
import { packageName } from '../../util/pkg-name.js';
import getCommandFlags from '../../util/get-command-flags.js';
import cmd from '../../util/output/cmd.js';
import Client from '../../util/client.js';
import getArgs from '../../util/get-args.js';

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

  output.spinner('Fetching user information');
  const user = await getUser(client);

  const accountIsCurrent = !currentTeam && user.version !== 'northstar';

  if (accountIsCurrent) {
    currentTeam = user.id;
  }

  const teamList = teams.map(({ id, slug, name }) => ({
    id,
    name,
    value: slug,
    current: id === currentTeam ? chars.tick : '',
  }));

  if (user.version !== 'northstar') {
    teamList.unshift({
      id: user.id,
      name: user.email,
      value: user.username || user.email,
      current: accountIsCurrent ? chars.tick : '',
    });
  }

  // Bring the current Team to the beginning of the list
  if (!accountIsCurrent) {
    const index = teamList.findIndex(choice => choice.id === currentTeam);
    const choice = teamList.splice(index, 1)[0];
    teamList.unshift(choice);
  }

  // Printing
  output.stopSpinner();
  client.stdout.write('\n'); // empty line

  table(
    ['', 'id', 'email / name'],
    teamList.map(team => [team.current, team.value, team.name]),
    [1, 5],
    (str: string) => {
      client.stdout.write(str);
    }
  );

  if (pagination?.count === 20) {
    const flags = getCommandFlags(argv, ['_', '--next', '-N', '-d']);
    const nextCmd = `${packageName} teams ls${flags} --next ${pagination.next}`;
    client.stdout.write('\n'); // empty line
    output.log(`To display the next page run ${cmd(nextCmd)}`);
  }

  return 0;
}
