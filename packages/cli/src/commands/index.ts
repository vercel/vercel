import { aliasCommand } from './alias/command';
import { bisectCommand } from './bisect/command';
import { buildCommand } from './build/command';
import { cacheCommand } from './cache/command';
import { certsCommand } from './certs/command';
import { curlCommand } from './curl/command';
import { deployCommand } from './deploy/command';
import { devCommand } from './dev/command';
import { dnsCommand } from './dns/command';
import { domainsCommand } from './domains/command';
import { envCommand } from './env/command';
import { gitCommand } from './git/command';
import { guidanceCommand } from './guidance/command';
import { httpstatCommand } from './httpstat/command';
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
import { mcpCommand } from './mcp/command';
import { microfrontendsCommand } from './microfrontends/command';
import { openCommand } from './open/command';
import { projectCommand } from './project/command';
import { promoteCommand } from './promote/command';
import { pullCommand } from './pull/command';
import { redeployCommand } from './redeploy/command';
import { redirectsCommand } from './redirects/command';
import { removeCommand } from './remove/command';
import { rollbackCommand } from './rollback/command';
import { rollingReleaseCommand } from './rolling-release/command';
import { targetCommand } from './target/command';
import { teamsCommand } from './teams/command';
import { telemetryCommand } from './telemetry/command';
import { whoamiCommand } from './whoami/command';
import { blobCommand } from './blob/command';
import type { Command } from './help';
import output from '../output-manager';

const commandsStructs = [
  aliasCommand,
  blobCommand,
  bisectCommand,
  buildCommand,
  cacheCommand,
  certsCommand,
  curlCommand,
  deployCommand,
  devCommand,
  dnsCommand,
  domainsCommand,
  envCommand,
  gitCommand,
  httpstatCommand,
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
  mcpCommand,
  microfrontendsCommand,
  openCommand,
  projectCommand,
  promoteCommand,
  pullCommand,
  redeployCommand,
  redirectsCommand,
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

if (process.env.FF_GUIDANCE_MODE) {
  commandsStructs.push(guidanceCommand);
}

export function getCommandAliases(command: Pick<Command, 'name' | 'aliases'>) {
  return [command.name].concat(command.aliases);
}

export const commands = new Map();
for (const command of commandsStructs) {
  const aliases = getCommandAliases(command);
  output.debug(
    `Registering command ${command.name} with aliases: ${JSON.stringify(aliases)}`
  );
  for (const alias of aliases) {
    output.debug(`Setting alias ${alias} -> ${command.name}`);
    commands.set(alias, command.name);
  }
}

output.debug(
  `All registered commands: ${JSON.stringify(Array.from(commands.entries()))}`
);
