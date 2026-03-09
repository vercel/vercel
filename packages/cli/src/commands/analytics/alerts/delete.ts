import type Client from '../../../util/client';
import output from '../../../output-manager';

export default async function deleteAlert(
  client: Client,
  args: string[],
  flags: { '--yes'?: boolean }
): Promise<number> {
  const alertId = args[0];
  if (!alertId) {
    output.error('Usage: vercel analytics alerts delete <alert-id>');
    return 1;
  }
  if (!flags['--yes']) {
    if (client.nonInteractive || !client.stdin.isTTY) {
      output.error(
        'This operation requires confirmation. Use --yes to skip confirmation in non-interactive mode.'
      );
      return 1;
    }
    const confirmed = await client.input.confirm(
      `Delete monitoring alert ${alertId}?`,
      false
    );
    if (!confirmed) {
      output.log('Aborted.');
      return 0;
    }
  }
  await client.fetch(
    `/v1/insights/monitoring/alerts/${encodeURIComponent(alertId)}`,
    { method: 'DELETE' }
  );
  output.log('Alert deleted.');
  return 0;
}
