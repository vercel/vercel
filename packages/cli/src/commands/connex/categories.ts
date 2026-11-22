import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { validateJsonOutput } from '../../util/output-format';
import { printError } from '../../util/error';
import { sanitizeForTerminal } from '../../util/connex/sanitize';
import table from '../../util/output/table';
import { packageName } from '../../util/pkg-name';

interface ConnexServiceCategory {
  slug: string;
  label: string;
  count: number;
}

export async function categories(
  client: Client,
  args: string[],
  flags: { '--format'?: string; '--json'?: boolean }
): Promise<number> {
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }

  if (args.length > 0) {
    output.error(
      `Too many arguments. Usage: \`${packageName} connect categories\``
    );
    return 2;
  }

  output.spinner('Fetching categories…');
  let fetched: ConnexServiceCategory[];
  try {
    const response = await client.fetch<{
      categories: ConnexServiceCategory[];
    }>('/v1/connect/services/categories', { teamOptional: true });
    fetched = response.categories ?? [];
  } catch (err: unknown) {
    output.stopSpinner();
    printError(err, client);
    return 1;
  }
  output.stopSpinner();

  if (formatResult.jsonOutput) {
    client.stdout.write(
      `${JSON.stringify({ categories: fetched }, null, 2)}\n`
    );
    return 0;
  }

  if (fetched.length === 0) {
    output.log('No categories found.');
    return 0;
  }

  output.print(
    `${table(
      [
        ['Slug', 'Label', 'Services'].map(h => chalk.bold(chalk.cyan(h))),
        ...fetched.map(c => [
          sanitizeForTerminal(c.slug),
          sanitizeForTerminal(c.label),
          String(c.count),
        ]),
      ],
      { hsep: 4 }
    )}\n`
  );
  output.log(
    `Run \`${packageName} connect discover --category <slug>\` to see a category's services.`
  );
  return 0;
}
