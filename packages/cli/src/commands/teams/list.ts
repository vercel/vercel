import chars from '../../util/output/chars';
import table from '../../util/output/table';
import { gray } from 'chalk';
import getUser from '../../util/get-user';
import getTeams from '../../util/teams/get-teams';
import { packageName } from '../../util/pkg-name';
import getCommandFlags from '../../util/get-command-flags';
import cmd from '../../util/output/cmd';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { listSubcommand } from './command';
import output from '../../output-manager';
import { TeamsListTelemetryClient } from '../../util/telemetry/commands/teams/list';

export default async function list(
  client: Client,
  argv: string[]
): Promise<number> {
  const { config, telemetryEventStore } = client;
  const telemetry = new TeamsListTelemetryClient({
    opts: {
      store: telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const next = parsedArgs.flags['--next'];
  telemetry.trackCliOptionNext(next);
  telemetry.trackCliOptionCount(parsedArgs.flags['--count']);
  telemetry.trackCliOptionUntil(parsedArgs.flags['--until']);
  telemetry.trackCliOptionSince(parsedArgs.flags['--since']);

  if (typeof next !== 'undefined' && !Number.isInteger(next)) {
    output.error('Please provide a number for flag `--next`');
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
    const flags = getCommandFlags(parsedArgs.flags, ['--next', '-N', '-d']);
    const nextCmd = `${packageName} teams ls${flags} --next ${pagination.next}`;
    client.stdout.write('\n'); // empty line
    output.log(`To display the next page run ${cmd(nextCmd)}`);
  }

  return 0;
}
