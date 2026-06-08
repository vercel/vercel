import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { validateJsonOutput } from '../../util/output-format';
import { notebooksSubcommand } from './command';
import { outputAgentError } from '../../util/agent-output';

export default async function notebooks(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsed;
  try {
    parsed = parseArguments(
      argv,
      getFlagsSpecification(notebooksSubcommand.options)
    );
  } catch (error) {
    printError(error);
    return 1;
  }

  const action = parsed.args[0];
  const id = parsed.args[1];
  const name = parsed.flags['--name'] as string | undefined;
  const formatResult = validateJsonOutput(parsed.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  try {
    if (action === 'ls' || action === 'list') {
      const notebooks = await client.fetch<Record<string, unknown>>(
        '/v1/observability/notebook'
      );
      if (asJson) {
        client.stdout.write(`${JSON.stringify({ notebooks }, null, 2)}\n`);
      } else {
        client.stdout.write(`${JSON.stringify(notebooks, null, 2)}\n`);
      }
      return 0;
    }

    if (action === 'inspect') {
      if (!id) {
        output.error('Usage: vercel observability notebooks inspect <id>');
        return 2;
      }
      const notebook = await client.fetch<Record<string, unknown>>(
        `/v1/observability/notebook/${encodeURIComponent(id)}`
      );
      if (asJson) {
        client.stdout.write(`${JSON.stringify({ notebook }, null, 2)}\n`);
      } else {
        client.stdout.write(`${JSON.stringify(notebook, null, 2)}\n`);
      }
      return 0;
    }

    if (action === 'create') {
      if (!name) {
        output.error(
          'Usage: vercel observability notebooks create --name <name>'
        );
        return 2;
      }
      const notebook = await client.fetch<Record<string, unknown>>(
        '/v1/observability/notebook',
        { method: 'POST', body: { name }, json: true }
      );
      if (asJson) {
        client.stdout.write(`${JSON.stringify({ notebook }, null, 2)}\n`);
      } else {
        output.success('Notebook created.');
      }
      return 0;
    }

    if (action === 'update') {
      if (!id || !name) {
        output.error(
          'Usage: vercel observability notebooks update <id> --name <name>'
        );
        return 2;
      }
      const notebook = await client.fetch<Record<string, unknown>>(
        `/v1/observability/notebook/${encodeURIComponent(id)}`,
        { method: 'PATCH', body: { name }, json: true }
      );
      if (asJson) {
        client.stdout.write(`${JSON.stringify({ notebook }, null, 2)}\n`);
      } else {
        output.success('Notebook updated.');
      }
      return 0;
    }

    if (action === 'rm' || action === 'remove' || action === 'delete') {
      if (!id) {
        output.error('Usage: vercel observability notebooks rm <id> --yes');
        return 2;
      }
      const yes = Boolean(parsed.flags['--yes']);
      if (!yes) {
        if (client.nonInteractive) {
          outputAgentError(
            client,
            {
              status: 'error',
              reason: 'confirmation_required',
              message:
                'Notebook removal requires --yes in non-interactive mode.',
            },
            1
          );
          return 1;
        }
        const confirmed = await client.input.confirm(
          `Delete notebook ${id}?`,
          false
        );
        if (!confirmed) return 0;
      }
      await client.fetch(
        `/v1/observability/notebook/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
        }
      );
      if (asJson) {
        client.stdout.write(
          `${JSON.stringify({ deleted: true, id }, null, 2)}\n`
        );
      } else {
        output.success('Notebook deleted.');
      }
      return 0;
    }

    output.error('Usage: observability notebooks ls|inspect|create|update|rm');
    return 2;
  } catch (error) {
    printError(error);
    return 1;
  }
}
