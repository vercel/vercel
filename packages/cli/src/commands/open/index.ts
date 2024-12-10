import openBrowser from 'open';
import { help } from '../help';
import { openCommand } from './command';
import { ensureLink } from '../../util/link/ensure-link';
import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import handleError from '../../util/handle-error';
import output from '../../output-manager';

type ParsedArgs = {
  args: string[];
  flags: Record<string, any>;
};

function isFlag(input: string) {
  return input.startsWith('--');
}

async function fromCurrent(
  client: Client,
  parsedArgs: ParsedArgs
): Promise<string> {
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

  return `${slug}/${name}`;
}

async function getArgs(
  client: Client,
  parsedArgs: ParsedArgs
): Promise<{ orgAndProject: string; section: string }> {
  const args = parsedArgs.args;

  if (args.length === 0) {
    return {
      orgAndProject: await fromCurrent(client, parsedArgs),
      section: '',
    };
  }

  if (args.length === 1) {
    if (!args[0].includes('/')) {
      return {
        orgAndProject: await fromCurrent(client, parsedArgs),
        section: args[0],
      };
    } else {
      return {
        orgAndProject: args[0],
        section: '',
      };
    }
  }

  if (args.length === 2) {
    return {
      orgAndProject: args[0],
      section: args[1],
    };
  }

  throw new Error('Invalid arguments');
}

export default async function open(client: Client): Promise<number> {
  let parsedArgs: null | ParsedArgs = null;

  const flagsSpecification = getFlagsSpecification(openCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(3), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    output.print(help(openCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const { args, query } = parsedArgs.args.reduce<{
    args: string[];
    query: Record<string, string>;
  }>(
    (acc, arg) => {
      if (isFlag(arg)) {
        const [key, value] = arg.split('=');
        acc.query[key.replace('--', '')] = value;
      } else {
        acc.args.push(arg);
      }
      return acc;
    },
    { args: [], query: {} }
  );

  const { orgAndProject, section } = await getArgs(client, {
    args,
    flags: parsedArgs.flags,
  });

  const url = new URL(`${orgAndProject}/${section}`, 'https://vercel.com/');
  url.search = new URLSearchParams(query).toString();

  await openBrowser(url.toString());
  output.dim(`opened ${url} in your browser`);

  return 0;
}
