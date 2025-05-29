import { aliasCommand } from './alias/command';
import { bisectCommand } from './bisect/command';
import { buildCommand } from './build/command';
import { certsCommand } from './certs/command';
import { deployCommand } from './deploy/command';
import { devCommand } from './dev/command';
import { dnsCommand } from './dns/command';
import { domainsCommand } from './domains/command';
import { envCommand } from './env/command';
import { gitCommand } from './git/command';
import { initCommand } from './init/command';
import { inspectCommand } from './inspect/command';
import { installCommand } from './install/command';
import { integrationResourceCommand } from './integration-resource/command';
import { integrationCommand } from './integration/command';
import { linkCommand } from './link/command';
import { listCommand } from './list/command';
import { loginCommand } from './login/command';
import { logoutCommand } from './logout/command';
import { logsCommand } from './logs/command';
import { projectCommand } from './project/command';
import { promoteCommand } from './promote/command';
import { pullCommand } from './pull/command';
import { redeployCommand } from './redeploy/command';
import { removeCommand } from './remove/command';
import { rollbackCommand } from './rollback/command';
import { rollingReleaseCommand } from './rolling-release/command';
import { targetCommand } from './target/command';
import { teamsCommand } from './teams/command';
import { telemetryCommand } from './telemetry/command';
import { whoamiCommand } from './whoami/command';
import type { Command } from './help';

const commandsStructs = [
  aliasCommand,
  bisectCommand,
  buildCommand,
  certsCommand,
  deployCommand,
  devCommand,
  dnsCommand,
  domainsCommand,
  envCommand,
  gitCommand,
  initCommand,
  inspectCommand,
  installCommand,
  integrationCommand,
  integrationResourceCommand,
  linkCommand,
  listCommand,
  loginCommand,
  logoutCommand,
  logsCommand,
  projectCommand,
  promoteCommand,
  pullCommand,
  redeployCommand,
  removeCommand,
  rollbackCommand,
  rollingReleaseCommand,
  targetCommand,
  teamsCommand,
  telemetryCommand,
  whoamiCommand,
  // added because we don't have a full help command
  { name: 'help', aliases: [] },
];

export function getCommandAliases(command: Pick<Command, 'name' | 'aliases'>) {
  return [command.name].concat(command.aliases);
}

export const commands = new Map();
for (const command of commandsStructs) {
  const aliases = getCommandAliases(command);
  for (const alias of aliases) {
    commands.set(alias, command.name);
  }
}
