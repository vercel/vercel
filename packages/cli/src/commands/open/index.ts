import openBrowser from 'open';

import { help } from '../help';
import { openCommand } from './command';

import { ensureLink } from '../../util/link/ensure-link';
import { parseArguments } from '../../util/get-args';
import Client from '../../util/client';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import handleError from '../../util/handle-error';

export default async function open(client: Client): Promise<number> {
  const { output } = client;

  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(openCommand.options);

  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    output.print(help(openCommand, { columns: client.stderr.columns }));
    return 2;
  }
  const linkedProject = await ensureLink('open', client, client.cwd, {
    autoConfirm: Boolean(parsedArgs.flags['--yes']),
  });

  if (typeof linkedProject === 'number') {
    const err: NodeJS.ErrnoException = new Error('Link project error');
    err.code = 'ERR_LINK_PROJECT';
    throw err;
  }

  const {
    org: { slug },
    project: { name },
  } = linkedProject;

  output.log(`Navigating to https://vercel.com/${slug}/${name}...`);
  openBrowser(`https://vercel.com/${slug}/${name}`);

  return 0;
}
