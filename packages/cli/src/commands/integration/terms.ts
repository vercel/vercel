import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { fetchIntegration } from '../../util/integration/fetch-integration';
import { installMarketplaceIntegration } from '../../util/integration/install-integration';
import type { AcceptedPolicies } from '../../util/integration/types';
import output from '../../output-manager';
import getScope from '../../util/get-scope';
import { termsSubcommand } from './command';
import { IntegrationTermsTelemetryClient } from '../../util/telemetry/commands/integration/terms';
import { validateJsonOutput } from '../../util/output-format';
import { packageName } from '../../util/pkg-name';

const MARKETPLACE_ADDENDUM_URL =
  'https://vercel.com/legal/integration-marketplace-end-users-addendum';

interface TermEntry {
  type: string;
  name: string;
  url: string;
}

function buildTermsList(integration: {
  privacyDocUri?: string;
  eulaDocUri?: string;
}): TermEntry[] {
  const terms: TermEntry[] = [
    {
      type: 'toc',
      name: 'Vercel Marketplace End User Addendum',
      url: MARKETPLACE_ADDENDUM_URL,
    },
  ];

  if (integration.privacyDocUri) {
    terms.push({
      type: 'privacy',
      name: 'Privacy Policy',
      url: integration.privacyDocUri,
    });
  }

  if (integration.eulaDocUri) {
    terms.push({
      type: 'eula',
      name: 'Terms of Service',
      url: integration.eulaDocUri,
    });
  }

  return terms;
}

function buildAcceptedPolicies(integration: {
  privacyDocUri?: string;
  eulaDocUri?: string;
}): AcceptedPolicies {
  const acceptedPolicies: AcceptedPolicies = {
    toc: new Date().toISOString(),
  };

  if (integration.privacyDocUri) {
    acceptedPolicies.privacy = new Date().toISOString();
  }

  if (integration.eulaDocUri) {
    acceptedPolicies.eula = new Date().toISOString();
  }

  return acceptedPolicies;
}

export async function terms(client: Client, subArgs: string[]) {
  const flagsSpecification = getFlagsSpecification(termsSubcommand.options);
  let parsedArguments;

  try {
    parsedArguments = parseArguments(subArgs, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const telemetry = new IntegrationTermsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  const acceptFlag = parsedArguments.flags['--accept'] as boolean | undefined;
  telemetry.trackCliFlagAccept(acceptFlag);

  const formatResult = validateJsonOutput(parsedArguments.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const integrationSlug = parsedArguments.args[0];
  if (!integrationSlug) {
    output.error(
      `You must specify an integration. Usage: ${packageName} integration terms <integration>`
    );
    return 1;
  }

  // Fetch integration details
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

  const termsList = buildTermsList(integration);

  if (acceptFlag) {
    // Accept mode: accept all terms and call install API
    const { team } = await getScope(client);
    if (!team) {
      output.error('Team not found');
      return 1;
    }
    client.config.currentTeam = team.id;

    const acceptedPolicies = buildAcceptedPolicies(integration);

    try {
      await installMarketplaceIntegration(
        client,
        integration.id,
        acceptedPolicies
      );
    } catch (error) {
      output.error(
        `Failed to accept terms for "${integrationSlug}": ${(error as Error).message}`
      );
      return 1;
    }

    if (asJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            accepted: true,
            integration: integrationSlug,
            terms: termsList,
          },
          null,
          2
        )}\n`
      );
    } else {
      output.success(
        `Terms accepted for "${integration.name}". You can now run \`${packageName} integration add ${integrationSlug}\` to install.`
      );
    }

    return 0;
  }

  // View mode: display terms
  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          integration: integrationSlug,
          terms: termsList,
          userReviewRequired: true,
          acceptCommand: `${packageName} integration terms ${integrationSlug} --accept`,
        },
        null,
        2
      )}\n`
    );
  } else {
    output.log(`Terms for "${integration.name}":\n`);

    for (let i = 0; i < termsList.length; i++) {
      const term = termsList[i];
      output.log(`  ${i + 1}. ${term.name}`);
      output.log(`     ${term.url}\n`);
    }

    output.log(
      `These terms are legal agreements. You must present the above terms to the user and obtain their explicit approval before running the --accept command.\nTo accept all terms, run:\n  ${packageName} integration terms ${integrationSlug} --accept`
    );
  }

  return 0;
}
