import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import { installationsSubcommand } from './command';
import { fetchAllMarketplaceInstallations } from '../../util/integration/fetch-all-marketplace-installations';
import { isAPIError } from '../../util/errors-ts';
import table from '../../util/output/table';
import chalk from 'chalk';

function pickIntegrationKey(row: Record<string, unknown>): string {
  const integration = row.integration as Record<string, unknown> | undefined;
  if (integration && typeof integration.slug === 'string') {
    return integration.slug;
  }
  if (typeof row.integrationId === 'string') {
    return row.integrationId;
  }
  return '-';
}

export default async function installationsList(
  client: Client,
  argv: string[]
): Promise<number> {
  const spec = getFlagsSpecification(installationsSubcommand.options);
  let parsed;
  try {
    parsed = parseArguments(argv, spec);
  } catch (e) {
    printError(e);
    return 1;
  }
  const fr = validateJsonOutput(parsed.flags);
  if (!fr.valid) {
    output.error(fr.error);
    return 1;
  }
  if (parsed.args.length > 0) {
    output.error(
      'Invalid number of arguments. Usage: `vercel integration installations [--integration <slug>] [--format json]`'
    );
    return 1;
  }
  const filterSlug = parsed.flags['--integration'] as string | undefined;

  const { team } = await getScope(client);
  if (!team) {
    output.error('No team context. Run `vercel switch` or use --scope.');
    return 1;
  }

  try {
    const rows = await fetchAllMarketplaceInstallations(client);
    const filtered = filterSlug
      ? rows.filter(r => {
          const key = pickIntegrationKey(r);
          return key === filterSlug || String(r.integrationId) === filterSlug;
        })
      : rows;

    if (fr.jsonOutput) {
      client.stdout.write(
        `${JSON.stringify({ installations: filtered }, null, 2)}\n`
      );
      return 0;
    }

    if (filtered.length === 0) {
      output.log('No marketplace installations found.');
      return 0;
    }

    const headers = ['Installation', 'Integration', 'Owner'].map(h =>
      chalk.cyan(h)
    );
    const lines: string[][] = [
      headers,
      ...filtered.map(r => {
        const id = String(r.id ?? r.integrationConfigurationId ?? '-');
        const integ = pickIntegrationKey(r);
        const owner = String(r.ownerId ?? '-');
        return [id, integ, owner];
      }),
    ];
    output.print(`\n${table(lines, { hsep: 2 }).replace(/^/gm, '  ')}\n`);
    return 0;
  } catch (err) {
    if (isAPIError(err)) {
      output.error(
        err.serverMessage ||
          `Could not list installations (${err.status}). If your API version requires a specific integration, pass --integration <slug>.`
      );
      return 1;
    }
    throw err;
  }
}
