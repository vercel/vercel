import chalk from 'chalk';
import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
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

const terminalMarked = new Marked(markedTerminal());

function renderMarkdown(content: string): string {
  return terminalMarked.parse(content) as string;
}

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

  const rawOutput = parsedArguments.flags['--raw'] as boolean | undefined;
  const frameworkFlag = parsedArguments.flags['--framework'] as
    | string
    | undefined;

  telemetry.trackCliFlagRaw(rawOutput);
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

  telemetry.trackCliArgumentIntegration(integrationSlug);

  output.spinner('Fetching integration details…', 500);

  let integration;
  try {
    integration = await fetchIntegration(client, integrationSlug);
  } catch (error) {
    output.error(
      `Failed to fetch integration "${integrationSlug}": ${(error as Error).message}`
    );
    return 1;
  }

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
      if (rawOutput) {
        printResourceLinksRaw(resourceLinks);
      } else {
        printResourceLinks(resourceLinks);
      }
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
    } else if (client.stdin.isTTY && !rawOutput) {
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

  if (rawOutput) {
    printRaw(product, selectedGuide, snippets, resourceLinks);
  } else {
    printFormatted(product, selectedGuide, snippets, resourceLinks);
  }

  return 0;
}

// ── Raw markdown output ──────────────────────────────────────────

function printRaw(
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
    lines.push('## Resources');
    lines.push('');
    for (const link of resourceLinks) {
      lines.push(`- [${link.title}](${link.href})`);
    }
    lines.push('');
  }

  output.print(lines.join('\n'));
}

// ── Formatted terminal output ────────────────────────────────────

function printFormatted(
  product: IntegrationProduct,
  guide: IntegrationGuide | undefined,
  snippets: IntegrationSnippet[],
  resourceLinks: IntegrationResourceLink[]
) {
  // Header
  output.print('\n');
  output.print(
    `${chalk.bold(product.name)} ${chalk.dim(`(${product.shortDescription})`)}\n`
  );
  output.print(`${chalk.dim('─'.repeat(60))}\n`);

  if (guide) {
    printGuide(guide);
  }

  if (snippets.length > 0) {
    printSnippets(snippets);
  }

  if (resourceLinks.length > 0) {
    printResourceLinks(resourceLinks);
  }
}

function printGuide(guide: IntegrationGuide) {
  output.print(renderMarkdown(`## Getting Started with ${guide.title}`));

  for (let i = 0; i < guide.steps.length; i++) {
    const step = guide.steps[i];
    output.print(renderMarkdown(`### Step ${i + 1}: ${step.title}`));
    output.print(renderMarkdown(step.content));
  }
}

function printSnippets(snippets: IntegrationSnippet[]) {
  output.print(`\n${chalk.dim('─'.repeat(60))}\n`);
  output.print(renderMarkdown('## Code Snippets'));

  for (const snippet of snippets) {
    const md = `### ${snippet.name}\n\n\`\`\`${snippet.language}\n${snippet.content}\n\`\`\``;
    output.print(renderMarkdown(md));
  }
}

function printResourceLinks(links: IntegrationResourceLink[]) {
  output.print(`\n${chalk.dim('─'.repeat(60))}\n`);
  output.print(renderMarkdown('## Resources'));

  for (const link of links) {
    output.print(
      `  ${chalk.cyan('→')} ${output.link(link.title, link.href, { fallback: () => `${link.title} ${chalk.dim(`(${link.href})`)}` })}\n`
    );
  }
  output.print('\n');
}

function printResourceLinksRaw(links: IntegrationResourceLink[]) {
  const lines = ['## Resources', ''];
  for (const link of links) {
    lines.push(`- [${link.title}](${link.href})`);
  }
  lines.push('');
  output.print(lines.join('\n'));
}
