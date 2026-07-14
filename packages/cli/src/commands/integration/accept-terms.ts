import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import getScope from '../../util/get-scope';
import { validateJsonOutput } from '../../util/output-format';
import { fetchIntegration } from '../../util/integration/fetch-integration';
import { fetchInstallations } from '../../util/integration/fetch-installations';
import { installMarketplaceIntegration } from '../../util/integration/marketplace-install-integration';
import {
  getMarketplacePolicyLinks,
  promptForTermAcceptance,
} from '../../util/integration/prompt-for-terms';
import type {
  AcceptedPolicies,
  Integration,
} from '../../util/integration/types';
import { acceptTermsSubcommand } from './command';
import { isAPIError } from '../../util/errors-ts';
import {
  buildCommandWithGlobalFlags,
  outputAgentError,
  shouldEmitNonInteractiveCommandError,
} from '../../util/agent-output';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { packageName } from '../../util/pkg-name';

function logPolicyLinksSummary(
  links: ReturnType<typeof getMarketplacePolicyLinks>
): void {
  output.log(`Marketplace addendum: ${links.marketplace_addendum}`);
  if (links.integration_privacy_policy) {
    output.log(`Privacy policy: ${links.integration_privacy_policy}`);
  }
  if (links.integration_eula) {
    output.log(`Terms of service: ${links.integration_eula}`);
  }
}

function policiesFromConfirmYes(integration: Integration): AcceptedPolicies {
  const policies: AcceptedPolicies = {
    toc: new Date().toISOString(),
  };
  if (integration.privacyDocUri) {
    policies.privacy = new Date().toISOString();
  }
  if (integration.eulaDocUri) {
    policies.eula = new Date().toISOString();
  }
  return policies;
}

export default async function acceptTerms(
  client: Client,
  argv: string[]
): Promise<number> {
  const spec = getFlagsSpecification(acceptTermsSubcommand.options);
  let parsed;
  try {
    parsed = parseArguments(argv, spec);
  } catch (e) {
    printError(e);
    return 1;
  }

  const formatResult = validateJsonOutput(parsed.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const preferJson =
    formatResult.jsonOutput || shouldEmitNonInteractiveCommandError(client);

  if (parsed.args.length < 1) {
    const msg = `Missing integration slug. Example: \`${packageName} integration accept-terms <integration>\``;
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message: msg,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'integration discover',
              packageName,
              { prependGlobalFlags: true }
            ),
            when: 'Find integration slugs',
          },
        ],
      },
      1
    );
    output.error(msg);
    return 1;
  }
  if (parsed.args.length > 1) {
    const msg = 'Specify only one integration at a time.';
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: msg,
      },
      1
    );
    output.error(msg);
    return 1;
  }

  const integrationSlug = parsed.args[0];
  const yes = Boolean(parsed.flags['--yes']);

  const { team } = await getScope(client);
  if (!team) {
    output.error('Team not found. Run `vercel switch` or use --scope.');
    return 1;
  }
  client.config.currentTeam = team.id;

  let integration: Integration;
  try {
    integration = await fetchIntegration(client, integrationSlug);
  } catch (error) {
    const msg = isAPIError(error)
      ? error.serverMessage || error.message
      : (error as Error).message;
    output.error(`Failed to load integration "${integrationSlug}": ${msg}`);
    return 1;
  }

  if (integration.capabilities?.requiresBrowserInstall) {
    const msg = `Integration "${integration.slug}" requires accepting terms in the browser (or device attestation). Use \`${packageName} integration add ${integration.slug}\` instead.`;
    outputAgentError(
      client,
      {
        status: 'error',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: msg,
        policy_links: getMarketplacePolicyLinks(integration),
        hint: 'The dashboard accept-terms flow is required for this integration.',
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              `integration add ${integration.slug}`,
              packageName,
              { prependGlobalFlags: true }
            ),
            when: 'Open browser / complete required install steps',
          },
        ],
      },
      1
    );
    output.error(msg);
    return 1;
  }

  const installations = await fetchInstallations(client, integration);
  const existing = installations.find(
    i => i.ownerId === team.id && i.installationType === 'marketplace'
  );
  const policyLinks = getMarketplacePolicyLinks(integration);

  if (existing) {
    if (preferJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            integration: integration.slug,
            installationId: existing.id,
            alreadyInstalled: true,
            policy_links: policyLinks,
          },
          null,
          2
        )}\n`
      );
      return 0;
    }
    output.log(
      `Integration ${chalk.bold(integration.slug)} is already installed for this team.`
    );
    return 0;
  }

  let acceptedPolicies: AcceptedPolicies | null;

  if (shouldEmitNonInteractiveCommandError(client)) {
    if (!yes) {
      const msg =
        'Non-interactive mode requires --yes to record acceptance of the Marketplace End User Addendum and any integration privacy policy / EULA.';
      outputAgentError(
        client,
        {
          status: 'error',
          reason: AGENT_REASON.MISSING_ARGUMENTS,
          message: msg,
          policy_links: getMarketplacePolicyLinks(integration),
          hint: `Run interactively without --non-interactive, or pass --yes after reading policy_links (and \`${packageName} integration discover\`).`,
          next: [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                `integration accept-terms ${integration.slug} --yes`,
                packageName,
                { prependGlobalFlags: true }
              ),
              when: 'After confirming policy text out of band',
            },
          ],
        },
        1
      );
      output.error(msg);
      return 1;
    }
    acceptedPolicies = policiesFromConfirmYes(integration);
  } else {
    acceptedPolicies = await promptForTermAcceptance(client, integration);
    if (!acceptedPolicies) {
      return 1;
    }
  }

  try {
    const result = await installMarketplaceIntegration(
      client,
      integration.id,
      acceptedPolicies
    );
    if (preferJson) {
      client.stdout.write(
        `${JSON.stringify(
          {
            integration: integration.slug,
            installationId: result.id,
            installed: true,
            policy_links: policyLinks,
          },
          null,
          2
        )}\n`
      );
      return 0;
    }
    output.success(
      `Terms accepted. Integration ${chalk.bold(integration.slug)} is installed for this team.`
    );
    logPolicyLinksSummary(policyLinks);
    return 0;
  } catch (error) {
    if (isAPIError(error) && error.status === 409) {
      if (preferJson) {
        client.stdout.write(
          `${JSON.stringify(
            {
              integration: integration.slug,
              alreadyInstalled: true,
              policy_links: policyLinks,
            },
            null,
            2
          )}\n`
        );
        return 0;
      }
      output.log(
        `Integration ${chalk.bold(integration.slug)} is already installed for this team.`
      );
      return 0;
    }
    const msg = isAPIError(error)
      ? error.serverMessage || error.message
      : (error as Error).message;
    output.error(`Failed to accept terms for "${integration.slug}": ${msg}`);
    return 1;
  }
}
