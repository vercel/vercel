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
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import { TeamsListTelemetryClient } from '../../util/telemetry/commands/teams/list';
import { validateLsArgs } from '../../util/validate-ls-args';

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

  const validationResult = validateLsArgs({
    commandName: 'teams ls',
    args: parsedArgs.args,
    maxArgs: 0,
    exitCode: 2,
  });
  if (validationResult !== 0) {
    return validationResult;
  }

  const next = parsedArgs.flags['--next'];
  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  telemetry.trackCliOptionNext(next);
  telemetry.trackCliOptionFormat(parsedArgs.flags['--format']);
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
    isCurrent: id === currentTeam,
  }));

  if (user.version !== 'northstar') {
    teamList.unshift({
      id: user.id,
      name: user.email,
      value: user.username || user.email,
      isCurrent: accountIsCurrent,
    });
  }

  // Bring the current Team to the beginning of the list
  if (!accountIsCurrent) {
    const index = teamList.findIndex(choice => choice.id === currentTeam);
    const choice = teamList.splice(index, 1)[0];
    teamList.unshift(choice);
  }

  output.stopSpinner();

  if (asJson) {
    const jsonOutput = {
      teams: teamList.map(team => ({
        id: team.id,
        slug: team.value,
        name: team.name,
        current: team.isCurrent,
      })),
      pagination,
    };
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
  } else {
    client.stdout.write('\n'); // empty line

    const teamTable = table(
      [
        ['id', 'Team name'].map(str => gray(str)),
        ...teamList.map(team => [team.value, team.name]),
      ],
      { hsep: 5 }
    );
    client.stderr.write(
      currentTeam
        ? teamTable
            .split('\n')
            .map((line, i) => {
              const prefix =
                i > 0 ? (teamList[i - 1].isCurrent ? chars.tick : ' ') : ' ';
              return `${prefix} ${line}`;
            })
            .join('\n')
        : teamTable
    );
    client.stderr.write('\n');

    if (pagination?.count === 20) {
      const flags = getCommandFlags(parsedArgs.flags, [
        '--next',
        '-N',
        '-d',
        '--format',
      ]);
      const nextCmd = `${packageName} teams ls${flags} --next ${pagination.next}`;
      client.stdout.write('\n'); // empty line
      output.log(`To display the next page run ${cmd(nextCmd)}`);
    }
  }

  return 0;
}
