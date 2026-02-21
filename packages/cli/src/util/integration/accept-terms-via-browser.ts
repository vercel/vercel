import open from 'open';
import output from '../../output-manager';
import sleep from '../sleep';
import type Client from '../client';
import type { Integration, IntegrationInstallation } from './types';
import { fetchInstallations } from './fetch-installations';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 300_000; // 5 minutes

/**
 * Opens a browser window for the user to accept terms and conditions,
 * then polls for the installation to appear.
 *
 * Used when the CLI is running in a non-interactive context (AI agent or non-TTY)
 * where interactive terminal prompts are not possible.
 */
export async function acceptTermsViaBrowser(
  client: Client,
  teamId: string,
  integration: Integration
): Promise<IntegrationInstallation | null> {
  const url = new URL('/api/marketplace/cli', 'https://vercel.com');
  url.searchParams.set('cmd', 'accept-terms');
  url.searchParams.set('integrationId', integration.id);
  url.searchParams.set('source', 'cli');

  output.log(
    `Opening browser to accept terms for ${integration.name}...`
  );
  output.log(
    'Please accept the terms and conditions in your browser to continue.'
  );

  output.debug(`Opening URL: ${url.href}`);
  open(url.href).catch((err: unknown) =>
    output.debug(`Failed to open browser: ${err}`)
  );

  output.spinner('Waiting for terms acceptance in browser...');

  const startTime = Date.now();

  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);

    try {
      const installations = await fetchInstallations(client, integration);
      const teamInstallation = installations.find(
        i => i.ownerId === teamId && i.installationType === 'marketplace'
      );

      if (teamInstallation) {
        output.stopSpinner();
        output.success('Terms accepted successfully.');
        return teamInstallation;
      }
    } catch {
      // Keep polling on transient errors
      output.debug('Polling for installation failed, retrying...');
    }
  }

  output.stopSpinner();
  output.error('Timed out waiting for terms acceptance. Please try again.');
  return null;
}
