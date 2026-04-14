import bytes from 'bytes';
import chalk from 'chalk';
import { format } from 'date-fns';
import output from '../../output-manager';

export interface StoreDetails {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  billingState: string;
  size: number;
  count?: number;
  region?: string;
  access?: string;
}

export function formatStoreDetails(
  store: StoreDetails,
  teamSlug?: string
): string {
  const dateTimeFormat = 'MM/DD/YYYY HH:mm:ss.SS';
  const isPublic = store.access !== 'private';
  const storeIdSuffix = store.id.replace('store_', '').toLowerCase();
  const accessDomain = isPublic ? 'public' : 'private';
  const billingState =
    store.billingState === 'active'
      ? chalk.green('Active')
      : chalk.red('Inactive');

  const lines: string[] = [
    `Blob Store: ${chalk.bold(store.name)} (${chalk.dim(store.id)})`,
    `Billing State: ${billingState}`,
  ];

  if (store.count !== undefined) {
    lines.push(`Blob Count: ${store.count.toLocaleString()}`);
  }

  lines.push(`Size: ${bytes(store.size)}`);

  if (store.region) {
    lines.push(`Region: ${store.region}`);
  }

  lines.push(`Access: ${isPublic ? 'Public' : 'Private'}`);
  lines.push(
    `Base URL: ${storeIdSuffix}.${accessDomain}.blob.vercel-storage.com`
  );

  if (teamSlug) {
    const dashboardUrl = `https://vercel.com/${teamSlug}/~/stores/blob/${store.id}`;
    const link = output.link(dashboardUrl, dashboardUrl);
    lines.push(`Dashboard: ${link || dashboardUrl}`);
  }

  lines.push(
    `Created At: ${format(new Date(store.createdAt), dateTimeFormat)}`
  );
  lines.push(
    `Updated At: ${format(new Date(store.updatedAt), dateTimeFormat)}`
  );

  return lines.join('\n') + '\n';
}
