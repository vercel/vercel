import { getCommandAliases } from '..';
import output from '../../output-manager';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { printError } from '../../util/error';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { IntegrationTelemetryClient } from '../../util/telemetry/commands/integration';
import { type Command, help } from '../help';
import { add } from './add';
import { balance } from './balance';
import {
  addSubcommand,
  balanceSubcommand,
  discoverSubcommand,
  integrationCommand,
  listSubcommand,
  openSubcommand,
  removeSubcommand,
} from './command';
import { list } from './list';
import { openIntegration } from './open-integration';
import { remove } from './remove-integration';
import { discover } from './discover';
import { fetchIntegration } from '../../util/integration/fetch-integration';
import { formatProductHelp } from '../../util/integration/format-product-help';
import { formatBillingPlansHelp } from '../../util/integration/format-billing-plans-help';
import { formatDynamicExamples } from '../../util/integration/format-dynamic-examples';
import { formatMetadataSchemaHelp } from '../../util/integration/format-schema-help';
import { fetchBillingPlans } from '../../util/integration/fetch-billing-plans';

const COMMAND_CONFIG = {
  add: getCommandAliases(addSubcommand),
  open: getCommandAliases(openSubcommand),
  list: getCommandAliases(listSubcommand),
  discover: getCommandAliases(discoverSubcommand),
  balance: getCommandAliases(balanceSubcommand),
  remove: getCommandAliases(removeSubcommand),
};

export default async function main(client: Client) {
  const telemetry = new IntegrationTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });
  const { args, flags } = parseArguments(
    client.argv.slice(2),
    getFlagsSpecification(integrationCommand.options),
    { permissive: true }
  );
  const {
    subcommand,
    subcommandOriginal,
    args: subArgs,
  } = getSubcommand(args.slice(1), COMMAND_CONFIG);

  const needHelp = flags['--help'];

  function printHelp(command: Command) {
    output.print(
      help(command, {
        columns: client.stderr.columns,
        parent: integrationCommand,
      })
    );
  }

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('integration');
    output.print(
      help(integrationCommand, {
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  switch (subcommand) {
    case 'add': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);

        // Dynamic help: if an integration slug is provided, fetch and show integration-specific help
        const rawArg = subArgs[0];
        if (rawArg) {
          // Strip product slug if slash syntax was used (e.g. "upstash/upstash-kv" → "upstash")
          const integrationSlug = rawArg.split('/')[0];
          const productSlug = rawArg.includes('/')
            ? rawArg.split('/')[1]
            : undefined;
          try {
            const integration = await fetchIntegration(client, integrationSlug);
            const products = integration.products ?? [];

            // Print help without static examples — we'll show dynamic ones instead
            printHelp({ ...addSubcommand, examples: [] });
            output.print(formatDynamicExamples(integrationSlug, products));

            if (products.length > 1) {
              output.print(formatProductHelp(integrationSlug, products));
            }
            // Show metadata schema for ALL products
            for (const product of products) {
              if (product.metadataSchema) {
                // For single-product integrations, don't show product slug
                // For multi-product integrations, show product slug for slash syntax
                const metadataProductSlug =
                  products.length > 1 ? product.slug : undefined;
                output.print(
                  formatMetadataSchemaHelp(
                    product.metadataSchema,
                    integrationSlug,
                    metadataProductSlug
                  )
                );
              }
            }
            // Show billing plans for each product (or just the specified one)
            const productsToShow = productSlug
              ? products.filter(p => p.slug === productSlug)
              : products;
            for (const product of productsToShow) {
              try {
                const { plans } = await fetchBillingPlans(
                  client,
                  integration,
                  product,
                  {}
                );
                output.print(formatBillingPlansHelp(product.name, plans));
              } catch (err: unknown) {
                output.debug(
                  `Failed to fetch billing plans for ${product.slug}: ${err}`
                );
              }
            }
            return 0;
          } catch (err: unknown) {
            output.debug(
              `Failed to fetch integration for dynamic help: ${err}`
            );
          }
        }

        // Fallback: no integration slug provided, or fetch failed — show static help
        printHelp(addSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);

      // Parse add-specific flags from subArgs (which contains everything after 'add')
      const addFlagsSpec = getFlagsSpecification(addSubcommand.options);
      let addParsedArgs;
      try {
        addParsedArgs = parseArguments(subArgs, addFlagsSpec);
      } catch (error) {
        printError(error);
        return 1;
      }
      return add(client, addParsedArgs.args, addParsedArgs.flags);
    }
    case 'list': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(listSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client);
    }
    case 'discover': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(discoverSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandDiscover(subcommandOriginal);
      return discover(client, subArgs);
    }
    case 'balance': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(balanceSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandBalance(subcommandOriginal);
      return balance(client, subArgs);
    }
    case 'open': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(openSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandOpen(subcommandOriginal);
      return openIntegration(client, subArgs);
    }
    case 'remove': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('integration', subcommandOriginal);
        printHelp(removeSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return remove(client);
    }
    default: {
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      return 2;
    }
  }
}
