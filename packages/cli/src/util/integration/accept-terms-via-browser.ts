import open from 'open';
import output from '../../output-manager';
import sleep from '../sleep';
import type Client from '../client';
import {
  buildCommandWithGlobalFlags,
  buildIntegrationCommandTailFromArgv,
  outputActionRequired,
  shouldEmitNonInteractiveCommandError,
} from '../agent-output';
import { AGENT_REASON } from '../agent-output-constants';
import { packageName } from '../pkg-name';
import { fetchInstallations } from './fetch-installations';
import { getMarketplacePolicyLinks } from './prompt-for-terms';
import type { Integration, IntegrationInstallation } from './types';

const POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function acceptTermsViaBrowser(
  client: Client,
  integration: Integration,
  teamId: string,
  teamSlug: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<IntegrationInstallation | null> {
  const url = new URL(
    `https://vercel.com/${encodeURIComponent(teamSlug)}/~/integrations/accept-terms/${encodeURIComponent(integration.slug)}`
  );
  url.searchParams.set('source', 'cli');

  output.log(
    'Opening browser for terms acceptance. Accept the terms to continue...'
  );
  output.log(`Visit this URL if the browser does not open: ${url.href}`);

  open(url.href).catch((err: unknown) =>
    output.debug(`Failed to open browser: ${err}`)
  );

  if (shouldEmitNonInteractiveCommandError(client)) {
    const tail = buildIntegrationCommandTailFromArgv(client.argv);
    const policyLinks = getMarketplacePolicyLinks(integration);
    const acceptTermsCmd = buildCommandWithGlobalFlags(
      client.argv,
      `integration accept-terms ${integration.slug} --yes`,
      packageName,
      { prependGlobalFlags: true }
    );
    const apiAcceptSupported =
      !integration.capabilities?.requiresBrowserInstall;
    outputActionRequired(
      client,
      {
        status: 'action_required',
        reason: AGENT_REASON.INTEGRATION_TERMS_ACCEPTANCE_REQUIRED,
        message: `Accept marketplace terms for "${integration.name}" in your browser before this install can finish. A browser window was opened (or open verification_uri manually). This command does not wait for acceptance in non-interactive mode.`,
        verification_uri: url.href,
        policy_links: policyLinks,
        userActionRequired: true,
        hint: apiAcceptSupported
          ? `Read policy_links, then either complete verification_uri and retry, or run the accept-terms command in next[] (API acceptance). Confirm with ${packageName} integration installations.`
          : `This integration is browser-gated: open verification_uri first. policy_links list the legal text. The accept-terms CLI command may not apply; after the dashboard flow completes, retry install from next[]. Confirm with ${packageName} integration installations.`,
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              tail,
              packageName,
              { prependGlobalFlags: true }
            ),
            when: 'Retry install after terms are accepted (browser or dashboard)',
          },
          {
            command: acceptTermsCmd,
            when: apiAcceptSupported
              ? 'Accept terms via API instead of the browser (after reading policy_links)'
              : 'Optional: only if this integration later supports API acceptance; browser-gated integrations will error — prefer verification_uri first',
          },
        ],
      },
      1
    );
  }

  output.spinner('Waiting for terms acceptance in browser...');

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    try {
      const installations = await fetchInstallations(client, integration);
      const teamInstallation = installations.find(
        i => i.ownerId === teamId && i.installationType === 'marketplace'
      );

      if (teamInstallation) {
        output.stopSpinner();
        output.success('Terms accepted in browser.');
        return teamInstallation;
      }
    } catch (error) {
      output.debug(`Polling error (will retry): ${error}`);
    }
  }

  output.stopSpinner();
  output.error(
    'Timed out waiting for terms acceptance. Please try again and accept terms in the browser within 5 minutes.'
  );
  return null;
}
