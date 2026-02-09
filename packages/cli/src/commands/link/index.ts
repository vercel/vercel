import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import cmd from '../../util/output/cmd';
import { ensureLink } from '../../util/link/ensure-link';
import { ensureRepoLink } from '../../util/link/repo';
import getTeams from '../../util/teams/get-teams';
import { help } from '../help';
import { linkCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { LinkTelemetryClient } from '../../util/telemetry/commands/link';

export default async function link(client: Client) {
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(linkCommand.options);

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const telemetry = new LinkTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('link');
    output.print(help(linkCommand, { columns: client.stderr.columns }));
    return 0;
  }

  telemetry.trackCliFlagRepo(parsedArgs.flags['--repo']);
  telemetry.trackCliFlagYes(parsedArgs.flags['--yes']);
  telemetry.trackCliOptionProject(parsedArgs.flags['--project']);

  if ('--confirm' in parsedArgs.flags) {
    telemetry.trackCliFlagConfirm(parsedArgs.flags['--confirm']);
    output.warn('`--confirm` is deprecated, please use `--yes` instead');
    parsedArgs.flags['--yes'] = parsedArgs.flags['--confirm'];
  }

  const yes = !!parsedArgs.flags['--yes'];

  let cwd = parsedArgs.args[1];
  if (cwd) {
    telemetry.trackCliArgumentCwd();
    output.warn(
      `The ${cmd('vc link <directory>')} syntax is deprecated, please use ${cmd(
        `vc link --cwd ${cwd}`
      )} instead`
    );
  } else {
    cwd = client.cwd;
  }

  if (parsedArgs.flags['--repo']) {
    output.warn(`The ${cmd('--repo')} flag is in alpha, please report issues`);
    try {
      await ensureRepoLink(client, cwd, { yes, overwrite: true });
    } catch (err) {
      output.prettyError(err);
      return 1;
    }
  } else {
    // Prefer the validated team ID set by the global handler (--team/--scope). When it is not set
    // (e.g. no scope passed), currentTeam may be undefined or from saved config. If the user passed
    // --team to link but currentTeam is still unset, resolve to a team ID and set it so selectOrg
    // has a default; never set a raw slug (always use team ID).
    const teamFlag = parsedArgs.flags['--team'];
    if (typeof teamFlag === 'string' && !client.config.currentTeam) {
      try {
        const teams = await getTeams(client);
        const related = teams.find(
          t => t.id === teamFlag || t.slug === teamFlag
        );
        if (related) {
          client.config.currentTeam = related.id;
        }
      } catch {
        // Let ensureLink/selectOrg handle missing team or API errors
      }
    }

    // Only use non-interactive behavior when the flag is explicitly enabled (link stays interactive otherwise)
    const linkNonInteractive = client.argv.includes('--non-interactive');

    const link = await ensureLink('link', client, cwd, {
      autoConfirm: yes || linkNonInteractive,
      forceDelete: true,
      projectName: parsedArgs.flags['--project'],
      projectId: parsedArgs.flags['--project-id'],
      successEmoji: 'success',
      nonInteractive: linkNonInteractive,
    });

    if (typeof link === 'number') {
      return link;
    }
  }

  return 0;
}
