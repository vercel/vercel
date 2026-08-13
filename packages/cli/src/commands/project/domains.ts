import type Client from '../../util/client';
import output from '../../output-manager';
import { getCommandName } from '../../util/pkg-name';
import { domainsUpdate } from './domains-update';

/**
 * Router for `vercel project domains <action>`. Today the only action is
 * `update`; keeping a dedicated router mirrors the `project checks` family and
 * leaves room for future domain actions.
 */
export default async function domains(
  client: Client,
  argv: string[]
): Promise<number> {
  const action = argv[0];

  if (action === 'update' || action === 'set') {
    return domainsUpdate(client, argv.slice(1));
  }

  output.error(
    `Unknown or missing action for ${getCommandName(
      'project domains'
    )}. Usage: ${getCommandName('project domains update <domain>')}`
  );
  return 2;
}
