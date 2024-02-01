import Client from '../../util/client';
import getArgs from '../../util/get-args';
import cmd from '../../util/output/cmd';
import { ensureLink } from '../../util/link/ensure-link';
import { ensureRepoLink } from '../../util/link/repo';
import { help } from '../help';
import { linkCommand } from './command';

export default async function link(client: Client) {
  const argv = getArgs(client.argv.slice(2), {
    '--yes': Boolean,
    '-y': '--yes',
    '--project': String,
    '-p': '--project',
    '--repo': Boolean,
    '-r': '--repo',

    // deprecated
    '--confirm': Boolean,
    '-c': '--confirm',
  });

  if (argv['--help']) {
    client.output.print(help(linkCommand, { columns: client.stderr.columns }));
    return 2;
  }

  if ('--confirm' in argv) {
    client.output.warn('`--confirm` is deprecated, please use `--yes` instead');
    argv['--yes'] = argv['--confirm'];
  }

  const yes = !!argv['--yes'];

  let cwd = argv._[1];
  if (cwd) {
    client.output.warn(
      `The ${cmd('vc link <directory>')} syntax is deprecated, please use ${cmd(
        `vc link --cwd ${cwd}`
      )} instead`
    );
  } else {
    cwd = client.cwd;
  }

  if (argv['--repo']) {
    client.output.warn(
      `The ${cmd('--repo')} flag is in alpha, please report issues`
    );
    await ensureRepoLink(client, cwd, { yes, overwrite: true });
  } else {
    const link = await ensureLink('link', client, cwd, {
      autoConfirm: yes,
      forceDelete: true,
      projectName: argv['--project'],
      successEmoji: 'success',
    });

    if (typeof link === 'number') {
      return link;
    }
  }

  return 0;
}
