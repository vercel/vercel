import chalk from 'chalk';
import type Client from '../../util/client';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import table from '../../util/output/table';
import output from '../../output-manager';
import { categoriesSubcommand } from './command';
import {
  fetchIntegrationCategories,
  type IntegrationCategory,
} from '../../util/integration/fetch-integration-categories';

export async function categories(client: Client, args: string[]) {
  let parsedArguments = null;
  const flagsSpecification = getFlagsSpecification(
    categoriesSubcommand.options
  );

  try {
    parsedArguments = parseArguments(args, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArguments.args.length > 0) {
    output.error(
      'Invalid number of arguments. Usage: `vercel integration categories`'
    );
    return 1;
  }

  const formatResult = validateJsonOutput(parsedArguments.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  output.spinner('Fetching integration categories...', 500);

  let fetched: IntegrationCategory[];
  try {
    fetched = await fetchIntegrationCategories(client);
  } catch (error) {
    output.error(
      `Failed to fetch integration categories: ${(error as Error).message}`
    );
    return 1;
  }

  output.stopSpinner();

  const projected = fetched.map(({ slug, title }) => ({ slug, title }));

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify({ categories: projected }, null, 2)}\n`
    );
    return 0;
  }

  if (projected.length === 0) {
    output.log('No integration categories found.');
    return 0;
  }

  const useCompactFormat =
    client.stderr.columns > 0 && client.stderr.columns < 80;
  const formattedOutput = useCompactFormat
    ? formatCompactList(projected)
    : formatTable(projected);
  output.log('Available marketplace categories:\n' + formattedOutput);
  return 0;
}

function formatTable(items: { slug: string; title: string }[]) {
  return table(
    [
      ['Slug', 'Title'].map(header => chalk.bold(chalk.cyan(header))),
      ...items.map(item => [item.slug, item.title]),
    ],
    { hsep: 4 }
  );
}

function formatCompactList(items: { slug: string; title: string }[]) {
  return items
    .map(item => `${chalk.bold(item.slug)}  ${item.title}`)
    .join('\n');
}
