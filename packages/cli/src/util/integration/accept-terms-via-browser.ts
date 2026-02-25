import open from 'open';
import output from '../../output-manager';
import sleep from '../sleep';
import type Client from '../client';
import { fetchInstallations } from './fetch-installations';
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
