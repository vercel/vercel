import type Client from '../../util/client';
import output from '../../output-manager';

export default async function notebooksDelete(
  client: Client,
  args: string[],
  flags: { '--yes'?: boolean }
): Promise<number> {
  const id = args[0];
  if (!id) {
    output.error('Usage: vercel observability notebooks delete <notebook-id>');
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
      `Delete notebook ${id}?`,
      false
    );
    if (!confirmed) {
      output.log('Aborted.');
      return 0;
    }
  }
  await client.fetch(`/v1/observability/notebook/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  output.log('Notebook deleted.');
  return 0;
}
