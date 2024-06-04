import chars from '../../util/output/chars';
import table from '../../util/output/table';
import { gray } from 'chalk';
import getUser from '../../util/get-user';
import getTeams from '../../util/teams/get-teams';
import { packageName } from '../../util/pkg-name';
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
    prefix: id === currentTeam ? chars.tick : ' ',
  }));

  if (user.version !== 'northstar') {
    teamList.unshift({
      id: user.id,
      name: user.email,
      value: user.username || user.email,
      prefix: accountIsCurrent ? chars.tick : ' ',
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

  const teamTable = table(
    [
      ['id', 'email / name'].map(str => gray(str)),
      ...teamList.map(team => [team.value, team.name]),
    ],
    { hsep: 5 }
  );
  client.stderr.write(
    currentTeam
      ? teamTable
          .split('\n')
          .map((line, i) => `${i > 0 ? teamList[i - 1].prefix : ' '} ${line}`)
          .join('\n')
      : teamTable
  );
  client.stderr.write('\n');

  if (pagination?.count === 20) {
    const flags = getCommandFlags(argv, ['_', '--next', '-N', '-d']);
    const nextCmd = `${packageName} teams ls${flags} --next ${pagination.next}`;
    client.stdout.write('\n'); // empty line
    output.log(`To display the next page run ${cmd(nextCmd)}`);
  }

  return 0;
}
