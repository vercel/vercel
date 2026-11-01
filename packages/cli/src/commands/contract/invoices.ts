import type Client from '../../util/client';
import output from '../../output-manager';
import chalk from 'chalk';

export async function listInvoices(
  client: Client,
  teamId: string | undefined,
  asJson: boolean
): Promise<number> {
  const query = new URLSearchParams();
  if (teamId) query.set('teamId', teamId);
  const path = query.size ? `/v1/invoices?${query}` : '/v1/invoices';
  const invoices = await client.fetch<Record<string, unknown>>(path);

  if (asJson) {
    client.stdout.write(`${JSON.stringify({ invoices }, null, 2)}\n`);
  } else {
    output.log(chalk.bold('Invoices'));
    client.stdout.write(`${JSON.stringify(invoices, null, 2)}\n`);
  }
  return 0;
}

export async function inspectInvoice(
  client: Client,
  invoiceId: string,
  teamId: string | undefined,
  asJson: boolean
): Promise<number> {
  const query = new URLSearchParams();
  if (teamId) query.set('teamId', teamId);
  const path = query.size
    ? `/v1/invoices/${encodeURIComponent(invoiceId)}?${query}`
    : `/v1/invoices/${encodeURIComponent(invoiceId)}`;
  const invoice = await client.fetch<Record<string, unknown>>(path);

  if (asJson) {
    client.stdout.write(`${JSON.stringify({ invoice }, null, 2)}\n`);
  } else {
    output.log(`${chalk.bold('Invoice')} ${invoiceId}`);
    client.stdout.write(`${JSON.stringify(invoice, null, 2)}\n`);
  }
  return 0;
}
