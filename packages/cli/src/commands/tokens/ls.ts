import { gray } from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { listSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';

interface TokenRow {
  id?: string;
  name?: string;
  type?: string;
  active?: boolean;
}

interface ListTokensResponse {
  tokens: TokenRow[];
  pagination?: { count?: number; next?: string | null; prev?: string | null };
}

export default async function ls(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const validation = validateJsonOutput(parsedArgs.flags);
  if (!validation.valid) {
    output.error(validation.error);
    return 1;
  }
  const asJson = validation.jsonOutput;

  const limit = parsedArgs.flags['--limit'];
  if (typeof limit === 'number' && (limit < 1 || limit > 100)) {
    output.error('`--limit` must be between 1 and 100.');
    return 1;
  }

  const params = new URLSearchParams();
  if (typeof limit === 'number') {
    params.set('limit', String(limit));
  }
  const qs = params.toString();
  const path = `/v6/user/tokens${qs ? `?${qs}` : ''}`;

  const result = await client.fetch<ListTokensResponse>(path, {
    useCurrentTeam: false,
  });

  const tokens = result.tokens || [];

  if (asJson) {
    client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  if (tokens.length === 0) {
    output.log('No tokens found.');
    return 0;
  }

  const rows = [
    ['id', 'name', 'type', 'active'].map(h => gray(h)),
    ...tokens.map(t => [
      t.id ?? '',
      t.name ?? '',
      t.type ?? '',
      t.active === undefined ? '' : String(t.active),
    ]),
  ];
  client.stderr.write(`${table(rows, { hsep: 2 })}\n`);
  return 0;
}
