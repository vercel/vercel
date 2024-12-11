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
  return input?.startsWith('--');
}

export function getArgsAndQuery(rawArgs: string[]) {
  return rawArgs.reduce(
    (result, arg, index) => {
      if (isFlag(arg)) {
        const [key, value] = arg.split('=');
        const nextArg = rawArgs[index + 1];

        if (value === undefined && nextArg && !isFlag(nextArg)) {
          result.query[key.replace('--', '')] = nextArg;
        } else {
          result.query[key.replace('--', '')] = value ?? true;
        }
      } else {
        const prevArg = rawArgs[index - 1];
        if (!isFlag(prevArg)) {
          result.args.push(arg);
        }
      }
      return result;
    },
    {
      args: [] as string[],
      query: {} as Record<string, string | boolean>,
    }
  );
}

export async function fromCurrent(client: Client): Promise<string> {
  const linkedProject = await ensureLink('open', client, client.cwd);

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

export async function getSlugAndSection(
  client: Client,
  args: string[]
): Promise<{ orgAndProject: string; section: string }> {
  if (args.length === 0) {
    return {
      orgAndProject: await fromCurrent(client),
      section: '',
    };
  }

  if (args.length === 1) {
    if (!args[0].includes('/')) {
      return {
        orgAndProject: await fromCurrent(client),
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

  const { args, query } = getArgsAndQuery(parsedArgs.args);
  const { orgAndProject, section } = await getSlugAndSection(client, args);

  const url = new URL(`${orgAndProject}/${section}`, 'https://vercel.com/');
  url.search = new URLSearchParams(query).toString();

  await openBrowser(url.toString());
  output.dim(`opened ${url} in your browser`);

  return 0;
}
