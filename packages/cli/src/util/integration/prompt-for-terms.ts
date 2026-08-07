import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../client';
import type { AcceptedPolicies, Integration } from './types';

export const MARKETPLACE_ADDENDUM_URL =
  'https://vercel.com/legal/integration-marketplace-end-users-addendum';

/** URLs for legal text referenced by `integration accept-terms` and install flows. */
export function getMarketplacePolicyLinks(
  integration: Pick<Integration, 'privacyDocUri' | 'eulaDocUri'>
): {
  marketplace_addendum: string;
  integration_privacy_policy?: string;
  integration_eula?: string;
} {
  const links: {
    marketplace_addendum: string;
    integration_privacy_policy?: string;
    integration_eula?: string;
  } = {
    marketplace_addendum: MARKETPLACE_ADDENDUM_URL,
  };
  if (integration.privacyDocUri) {
    links.integration_privacy_policy = integration.privacyDocUri;
  }
  if (integration.eulaDocUri) {
    links.integration_eula = integration.eulaDocUri;
  }
  return links;
}

export async function promptForTermAcceptance(
  client: Client,
  integration: Integration
): Promise<AcceptedPolicies | null> {
  if (client.isAgent) {
    output.error(
      'Term acceptance cannot be performed by an AI agent. Run this command directly in your terminal.'
    );
    return null;
  }

  if (!client.stdin.isTTY) {
    output.error(
      'Term acceptance requires an interactive terminal. Run this command in a TTY.'
    );
    return null;
  }

  // Collect every legal document the user must agree to so they can be
  // reviewed together and accepted with a single confirmation.
  const documents: { label: string; url: string }[] = [
    {
      label: 'Vercel Marketplace End User Addendum',
      url: MARKETPLACE_ADDENDUM_URL,
    },
  ];
  if (integration.privacyDocUri) {
    documents.push({
      label: 'Privacy Policy',
      url: integration.privacyDocUri,
    });
  }
  if (integration.eulaDocUri) {
    documents.push({
      label: 'Terms of Service',
      url: integration.eulaDocUri,
    });
  }

  output.print('\n');
  output.log(
    `Installing ${chalk.bold(integration.name)} requires accepting the following:`
  );
  output.print('\n');
  for (const { label, url } of documents) {
    output.print(`  ${chalk.bold(label)}\n`);
    output.print(`  ${chalk.dim(url)}\n`);
    output.print('\n');
  }

  const accepted = await client.input.confirm(
    'Accept all of the documents listed above?',
    false
  );
  if (!accepted) {
    output.error('All of the listed documents must be accepted to continue.');
    return null;
  }

  const acceptedAt = new Date().toISOString();
  const acceptedPolicies: AcceptedPolicies = {
    toc: acceptedAt,
  };
  if (integration.privacyDocUri) {
    acceptedPolicies.privacy = acceptedAt;
  }
  if (integration.eulaDocUri) {
    acceptedPolicies.eula = acceptedAt;
  }

  return acceptedPolicies;
}
