import { aliasCommand } from '../src/commands/alias/command';
import { bisectCommand } from '../src/commands/bisect/command';
import { buildCommand } from '../src/commands/build/command';
import { certsCommand } from '../src/commands/certs/command';
import { deployCommand } from '../src/commands/deploy/command';
import { dnsCommand } from '../src/commands/dns/command';
import { domainsCommand } from '../src/commands/domains/command';
import { envCommand } from '../src/commands/env/command';
import { gitCommand } from '../src/commands/git/command';
import { initCommand } from '../src/commands/init/command';
import { inspectCommand } from '../src/commands/inspect/command';
import { linkCommand } from '../src/commands/link/command';
import { listCommand } from '../src/commands/list/command';
import { loginCommand } from '../src/commands/login/command';
import { projectCommand } from '../src/commands/project/command';
import { promoteCommand } from '../src/commands/promote/command';
import { pullCommand } from '../src/commands/pull/command';
import { redeployCommand } from '../src/commands/redeploy/command';
import { removeCommand } from '../src/commands/remove/command';
import { rollbackCommand } from '../src/commands/rollback/command';
import { rollingReleaseCommand } from '../src/commands/rolling-release/command';
import { teamsCommand, listSubcommand } from '../src/commands/teams/command';
import { whoamiCommand } from '../src/commands/whoami/command';
import { devCommand } from '../src/commands/dev/command';
import { logoutCommand } from '../src/commands/logout/command';
import { logsCommand } from '../src/commands/logs/command';
import { targetCommand } from '../src/commands/target/command';
import { globalCommandOptions } from '../src/util/arg-common';

const commands = {
  alias: aliasCommand.options,
  bisect: bisectCommand.options,
  build: buildCommand.options,
  certs: certsCommand.options,
  deploy: deployCommand.options,
  dev: devCommand.options,
  dns: dnsCommand.options,
  domains: domainsCommand.options,
  env: envCommand.options,
  git: gitCommand.options,
  init: initCommand.options,
  inspect: inspectCommand.options,
  link: linkCommand.options,
  list: listCommand.options,
  login: loginCommand.options,
  logout: logoutCommand.options,
  logs: logsCommand.options,
  project: projectCommand.options,
  promote: promoteCommand.options,
  pull: pullCommand.options,
  redeploy: redeployCommand.options,
  remove: removeCommand.options,
  rollback: rollbackCommand.options,
  'rolling-release': rollingReleaseCommand.options,
  target: targetCommand.options,
  teams: teamsCommand.options,
  'teams (list)': listSubcommand.options,
  whoami: whoamiCommand.options,
  global: globalCommandOptions,
};

// eslint-disable-next-line no-console
console.log(`command,name,shorthand,type,deprecated,description`);
for (const command of Object.keys(commands)) {
  for (const option of commands[command]) {
    // eslint-disable-next-line no-console
    console.log(
      `${command},${option.name},${option.shorthand ?? '(null)'},${option.type.name},${option.deprecated},"${option.description ?? ''}"`
    );
  }
}
