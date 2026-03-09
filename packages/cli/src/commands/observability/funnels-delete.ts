import type Client from '../../util/client';
import output from '../../output-manager';

export default async function funnelsDelete(
  client: Client,
  args: string[],
  flags: { '--yes'?: boolean }
): Promise<number> {
  const id = args[0];
  if (!id) {
    output.error('Usage: vercel observability funnels delete <funnel-id>');
    return 1;
  }
  if (!flags['--yes']) {
    if (client.nonInteractive || !client.stdin.isTTY) {
      output.error(
        'This operation requires confirmation. Use --yes to skip confirmation in non-interactive mode.'
      );
      return 1;
    }
    const confirmed = await client.input.confirm(`Delete funnel ${id}?`, false);
    if (!confirmed) {
      output.log('Aborted.');
      return 0;
    }
  }
  await client.fetch(`/v1/observability/funnels/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  output.log('Funnel deleted.');
  return 0;
}
