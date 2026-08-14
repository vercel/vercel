import chalk from 'chalk';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { fetchIntegration } from '../../util/integration/fetch-integration';
import type {
  IntegrationGuide,
  IntegrationProduct,
  IntegrationResourceLink,
  IntegrationSnippet,
} from '../../util/integration/types';
import output from '../../output-manager';
import { guideSubcommand } from './command';
import { IntegrationGuideTelemetryClient } from '../../util/telemetry/commands/integration/guide';

export async function guide(client: Client, subArgs: string[]) {
  const flagsSpecification = getFlagsSpecification(guideSubcommand.options);
  let parsedArguments;

  try {
    parsedArguments = parseArguments(subArgs, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const telemetry = new IntegrationGuideTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  const frameworkFlag = parsedArguments.flags['--framework'] as
    | string
    | undefined;

  telemetry.trackCliOptionFramework(frameworkFlag);

  const rawArg = parsedArguments.args[0];
  if (!rawArg) {
    output.error(
      'You must specify an integration. Usage: vercel integration guide <integration>[/<product>]'
    );
    return 1;
  }

  const integrationSlug = rawArg.split('/')[0];
  const productSlug = rawArg.includes('/') ? rawArg.split('/')[1] : undefined;

  output.spinner('Fetching integration details…', 500);

  let integration;
  try {
    integration = await fetchIntegration(client, integrationSlug);
  } catch (error) {
    telemetry.trackCliArgumentIntegration(integrationSlug);
    output.error(
      `Failed to fetch integration "${integrationSlug}": ${(error as Error).message}`
    );
    return 1;
  }

  telemetry.trackCliArgumentIntegration(integrationSlug, true);

  const products = integration.products ?? [];

  if (products.length === 0) {
    output.stopSpinner();
    output.log(`No products found for integration "${integrationSlug}".`);
    return 0;
  }

  let product: IntegrationProduct | undefined;

  if (productSlug) {
    product = products.find(p => p.slug === productSlug);
    if (!product) {
      output.stopSpinner();
      output.error(
        `Product "${productSlug}" not found for integration "${integrationSlug}".`
      );
      if (products.length > 1) {
        output.log('Available products:');
        for (const p of products) {
          output.log(`  ${chalk.cyan(p.slug)}  ${p.name}`);
        }
      }
      return 1;
    }
  } else if (products.length === 1) {
    product = products[0];
  } else {
    output.stopSpinner();

    if (!client.stdin.isTTY) {
      output.error(
        `"${integrationSlug}" has multiple products. Specify one with: vercel integration guide ${integrationSlug}/<product>`
      );
      output.log('Available products:');
      for (const p of products) {
        output.log(`  ${chalk.cyan(p.slug)}  ${p.name}`);
      }
      return 1;
    }

    product = await client.input.select<IntegrationProduct>({
      message: `"${integrationSlug}" has multiple products. Select one:`,
      choices: products.map(p => ({
        name: `${p.name} (${p.slug})`,
        value: p,
      })),
    });
  }

  output.stopSpinner();

  const guides = product.guides ?? [];
  const snippets = product.snippets ?? [];
  const resourceLinks = product.resourceLinks ?? [];

  if (guides.length === 0 && snippets.length === 0) {
    output.log(`No guides or snippets available for "${product.name}" yet.`);
    if (resourceLinks.length > 0) {
      printResourceLinks(client, resourceLinks);
    }
    return 0;
  }

  // Handle guide selection
  let selectedGuide: IntegrationGuide | undefined;

  if (guides.length > 0) {
    if (frameworkFlag) {
      selectedGuide = guides.find(g => g.framework === frameworkFlag);
      if (!selectedGuide) {
        output.error(
          `Framework "${frameworkFlag}" not found for "${product.name}".`
        );
        output.log('Available frameworks:');
        for (const g of guides) {
          output.log(`  ${chalk.cyan(g.framework)}  ${g.title}`);
        }
        return 1;
      }
    } else if (guides.length === 1) {
      selectedGuide = guides[0];
    } else if (client.stdin.isTTY) {
      selectedGuide = await client.input.select<IntegrationGuide>({
        message: 'Select a framework guide:',
        choices: guides.map(g => ({
          name: g.title,
          value: g,
        })),
      });
    } else {
      selectedGuide = guides[0];
    }
  }

  printGuide(client, product, selectedGuide, snippets, resourceLinks);

  return 0;
}

function printGuide(
  client: Client,
  product: IntegrationProduct,
  guide: IntegrationGuide | undefined,
  snippets: IntegrationSnippet[],
  resourceLinks: IntegrationResourceLink[]
) {
  const lines: string[] = [];

  lines.push(`# ${product.name}`);
  lines.push('');
  lines.push(product.shortDescription);
  lines.push('');

  if (guide) {
    lines.push(`## Getting Started with ${guide.title}`);
    lines.push('');
    for (let i = 0; i < guide.steps.length; i++) {
      const step = guide.steps[i];
      lines.push(`### Step ${i + 1}: ${step.title}`);
      lines.push('');
      lines.push(step.content);
      lines.push('');
    }
  }

  if (snippets.length > 0) {
    lines.push('## Code Snippets');
    lines.push('');
    for (const snippet of snippets) {
      lines.push(`### ${snippet.name}`);
      lines.push('');
      lines.push(`\`\`\`${snippet.language}`);
      lines.push(snippet.content);
      lines.push('```');
      lines.push('');
    }
  }

  if (resourceLinks.length > 0) {
    appendResourceLinks(resourceLinks, lines);
  }

  client.stdout.write(`${lines.join('\n')}\n`);
}

function appendResourceLinks(
  links: IntegrationResourceLink[],
  lines: string[]
) {
  lines.push('## Resources');
  lines.push('');
  for (const link of links) {
    lines.push(`- [${link.title}](${link.href})`);
  }
  lines.push('');
}

function printResourceLinks(client: Client, links: IntegrationResourceLink[]) {
  const lines: string[] = [];
  appendResourceLinks(links, lines);
  client.stdout.write(`${lines.join('\n')}\n`);
}
