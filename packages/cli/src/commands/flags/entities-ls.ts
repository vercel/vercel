import chalk from 'chalk';
import plural from 'pluralize';
import type Client from '../../util/client';
import { getCommandName } from '../../util/pkg-name';
import { getFlagSettings } from '../../util/flags/get-flags';
import { isAPIError } from '../../util/errors-ts';
import { buildCommandWithGlobalFlags } from '../../util/agent-output';
import cmd from '../../util/output/cmd';
import formatTable from '../../util/format-table';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { entitiesListSubcommand } from './command';
import type { FlagSettingsEntity } from '../../util/flags/types';
import { getProjectNameFromFlags } from './project';
import {
  formatAttributeList,
  parseEntityArguments,
  isExitCodeResult,
  resolveEntitiesProject,
} from './entities-common';

export default async function entitiesLs(
  client: Client,
  argv: string[]
): Promise<number> {
  const parsedArgs = parseEntityArguments(
    client,
    argv,
    entitiesListSubcommand.options
  );

  const { flags } = parsedArgs;
  const json = flags['--json'] as boolean | undefined;
  const projectName = getProjectNameFromFlags(flags);

  const context = await resolveEntitiesProject(client, projectName);
  if (isExitCodeResult(context)) {
    return context.exitCode;
  }

  const { project, projectSlugLink } = context;
  const lsStamp = stamp();

  output.spinner(`Fetching feature flag entities for ${projectSlugLink}`);

  const settings = await getFlagSettings(client, project.id).catch(err => {
    if (
      isAPIError(err) &&
      err.status === 404 &&
      err.code === 'settings_not_found'
    ) {
      return undefined;
    }
    throw err;
  });
  output.stopSpinner();

  const entities = settings?.entities ?? [];

  if (json) {
    client.stdout.write(`${JSON.stringify({ entities }, null, 2)}\n`);
  } else if (!settings) {
    output.log(`Flags is not set up for ${projectSlugLink} yet.`);
    output.log(
      `\nCreate your first flag to set it up: ${cmd(buildCommandWithGlobalFlags(client.argv, 'flags create my-feature', undefined, { preserveProject: true }))}`
    );
  } else if (entities.length === 0) {
    output.log(
      `No feature flag entities found for ${projectSlugLink} ${chalk.gray(lsStamp())}`
    );
    output.log(
      `\nCreate one with: ${getCommandName('flags entities create user --label User --attribute id:string')}`
    );
  } else {
    output.log(
      `${plural('feature flag entity', entities.length, true)} found for ${projectSlugLink} ${chalk.gray(lsStamp())}`
    );
    printEntitiesTable(entities);
  }

  return 0;
}

function printEntitiesTable(entities: FlagSettingsEntity[]) {
  const headers = ['Kind', 'Label', 'Attributes'];
  const rows = entities.map(entity => [
    chalk.bold(entity.kind),
    entity.label,
    formatAttributeList(entity),
  ]);

  const table = formatTable(headers, ['l', 'l', 'l'], [{ name: '', rows }]);
  output.print(`\n${table}\n`);
}
