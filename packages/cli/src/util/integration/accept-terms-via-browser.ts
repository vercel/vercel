import open from 'open';
import output from '../../output-manager';
import sleep from '../sleep';
import type Client from '../client';
import {
  buildCommandWithGlobalFlags,
  buildIntegrationCommandTailFromArgv,
  shouldEmitNonInteractiveCommandError,
  writeActionRequired,
} from '../agent-output';
import { AGENT_REASON } from '../agent-output-constants';
import { packageName } from '../pkg-name';
import { fetchInstallations } from './fetch-installations';
import { getMarketplacePolicyLinks } from './prompt-for-terms';
import type { Integration, IntegrationInstallation } from './types';

const POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export type BrowserTermsResult =
  | { status: 'accepted'; installation: IntegrationInstallation }
  /** The terms URL was handed back as an `action_required` payload. */
  | { status: 'action_required' }
  | { status: 'timeout' };

export async function acceptTermsViaBrowser(
  client: Client,
  integration: Integration,
  teamId: string,
  teamSlug: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<BrowserTermsResult> {
  const url = new URL(
    `https://vercel.com/${encodeURIComponent(teamSlug)}/~/integrations/accept-terms/${encodeURIComponent(integration.slug)}`
  );
  url.searchParams.set('source', 'cli');

  // Without a TTY (coding agents, CI, scripts) nobody is watching a browser
  // tab, and the caller is blocked until this command exits. Hand back the
  // terms URL right away instead of opening a browser and polling.
  // Non-interactive mode gets the same result in a TTY, as JSON.
  const machine = shouldEmitNonInteractiveCommandError(client);
  if (machine || !client.stdin.isTTY) {
    const retryCommand = buildCommandWithGlobalFlags(
      client.argv,
      buildIntegrationCommandTailFromArgv(client.argv),
      packageName,
      { prependGlobalFlags: true }
    );
    if (machine) {
      writeActionRequired(client, {
        status: 'action_required',
        reason: AGENT_REASON.INTEGRATION_TERMS_ACCEPTANCE_REQUIRED,
        message: `Accept marketplace terms for "${integration.name}" in your browser before this install can finish. Open verification_uri to start. This command does not wait for acceptance in non-interactive mode.`,
        verification_uri: url.href,
        policy_links: getMarketplacePolicyLinks(integration),
        userActionRequired: true,
        hint: `Read policy_links, complete verification_uri in the browser, then retry install from next[]. Confirm with ${packageName} integration installations.`,
        next: [
          {
            command: retryCommand,
            when: 'Retry install after terms are accepted (browser or dashboard)',
          },
        ],
      });
    } else {
      output.error(
        `Marketplace terms for "${integration.name}" must be accepted in a browser before this install can finish.`
      );
      output.log(
        `Accept them at ${url.href}, then run \`${retryCommand}\` again.`
      );
    }
    return { status: 'action_required' };
  }

  output.log(
    'Opening browser for terms acceptance. Accept the terms to continue...'
  );
  output.log(`Visit this URL if the browser does not open: ${url.href}`);
  try {
    await open(url.href);
  } catch (err) {
    output.debug(`Failed to open browser: ${err}`);
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
        return { status: 'accepted', installation: teamInstallation };
      }
    } catch (error) {
      output.debug(`Polling error (will retry): ${error}`);
    }
  }

  output.stopSpinner();
  output.error(
    'Timed out waiting for terms acceptance. Please try again and accept terms in the browser within 5 minutes.'
  );
  return { status: 'timeout' };
}
