import Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import cmd from '../../util/output/cmd';
import { ensureLink } from '../../util/link/ensure-link';
import { ensureRepoLink } from '../../util/link/repo';
import { help } from '../help';
import { linkCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import handleError from '../../util/handle-error';

export default async function link(client: Client) {
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(linkCommand.options);

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    handleError(error);
    return 1;
  }

  const { output } = client;

  if (parsedArgs.flags['--help']) {
    output.print(help(linkCommand, { columns: client.stderr.columns }));
    return 2;
  }

  if ('--confirm' in parsedArgs.flags) {
    client.output.warn('`--confirm` is deprecated, please use `--yes` instead');
    parsedArgs.flags['--yes'] = parsedArgs.flags['--confirm'];
  }

  const yes = !!parsedArgs.flags['--yes'];

  let cwd = parsedArgs.args[1];
  if (cwd) {
    client.output.warn(
      `The ${cmd('vc link <directory>')} syntax is deprecated, please use ${cmd(
        `vc link --cwd ${cwd}`
      )} instead`
    );
  } else {
    cwd = client.cwd;
  }

  if (parsedArgs.flags['--repo']) {
    client.output.warn(
      `The ${cmd('--repo')} flag is in alpha, please report issues`
    );
    await ensureRepoLink(client, cwd, { yes, overwrite: true });
  } else {
    const link = await ensureLink('link', client, cwd, {
      autoConfirm: yes,
      forceDelete: true,
      projectName: parsedArgs.flags['--project'],
      successEmoji: 'success',
    });

    if (typeof link === 'number') {
      return link;
    }
  }

  return 0;
}
