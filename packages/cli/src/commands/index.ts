import { agentCommand } from './agent/command';
import { agentRunsCommand } from './agent-runs/command';
import { activityCommand } from './activity/command';
import { aiGatewayCommand } from './ai-gateway/command';
import { alertsCommand } from './alerts/command';
import { aliasCommand } from './alias/command';
import { apiCommand } from './api/command';
import { bisectCommand } from './bisect/command';
import { buildCommand } from './build/command';
import { buildersCommand } from './builders/command';
import { buyCommand } from './buy/command';
import { cacheCommand } from './cache/command';
import { certsCommand } from './certs/command';
import { changelogCommand } from './changelog/command';
import { ciCommand } from './ci/command';
import { commentsCommand } from './comments/command';
import { connexCommand } from './connex/command';
import { contractCommand } from './contract/command';
import { cronsCommand } from './crons/command';
import { daemonsCommand } from './daemons/command';
import { curlCommand } from './curl/command';
import { deployCommand } from './deploy/command';
import { deployHooksCommand } from './deploy-hooks/command';
import { devCommand } from './dev/command';
import { dnsCommand } from './dns/command';
import { domainsCommand } from './domains/command';
import { drainsCommand } from './drains/command';
import { envCommand } from './env/command';
import { experimentsCommand } from './experiments/command';
import { feedbackCommand } from './feedback/command';
import { firewallCommand } from './firewall/command';
import { flagsCommand } from './flags/command';
import { gitCommand } from './git/command';
import { globalConfigCommand } from './global-config/command';
import { guidanceCommand } from './guidance/command';
import { healthCommand } from './health/command';
import { httpstatCommand } from './httpstat/command';
import { initCommand } from './init/command';
import { inspectCommand } from './inspect/command';
import { installCommand } from './install/command';
import { integrationResourceCommand } from './integration-resource/command';
import { integrationCommand } from './integration/command';
import { kmsCommand } from './kms/command';
import { linkCommand } from './link/command';
import { listCommand } from './list/command';
import { loginCommand } from './login/command';
import { logoutCommand } from './logout/command';
import { logsCommand } from './logs/command';
import { mcpCommand } from './mcp/command';
import { metricsCommand } from './metrics/command';
import { microfrontendsCommand } from './microfrontends/command';
import { monitorsCommand } from './monitors/command';
import { openCommand } from './open/command';
import { organizationsCommand } from './organizations/command';
import { pricingCommand } from './pricing/command';
import { projectCommand } from './project/command';
import { promoteCommand } from './promote/command';
import { pullCommand } from './pull/command';
import { redeployCommand } from './redeploy/command';
import { redirectsCommand } from './redirects/command';
import { removeCommand } from './remove/command';
import { routesCommand } from './routes/command';
import { rollbackCommand } from './rollback/command';
import { rollingReleaseCommand } from './rolling-release/command';
import { sandboxCommand } from './sandbox/command';
import { schedulesCommand } from './schedules/command';
import { securityCommand } from './security/command';
import { setupCommand } from './setup/command';
import { signupCommand } from './signup/command';
import { skillsCommand } from './skills/command';
import { storageCommand } from './storage/command';
import { targetCommand } from './target/command';
import { teamsCommand } from './teams/command';
import { tokensCommand } from './tokens/command';
import { tokenPassCommand } from './token-pass/command';
import { telemetryCommand } from './telemetry/command';
import { tracesCommand } from './traces/command';
import { upgradeCommand } from './upgrade/command';
import { usageCommand } from './usage/command';
import { vcrCommand } from './vcr/command';
import { versionCommand } from './version/command';
import { whoamiCommand } from './whoami/command';
import { blobCommand } from './blob/command';
import { budgetCommand } from './budget/command';
import { webhooksCommand } from './webhooks/command';
import { registerCommandPaths, type Command } from './help';
import output from '../output-manager';

export const commandsStructs = [
  agentCommand,
  agentRunsCommand,
  aiGatewayCommand,
  alertsCommand,
  aliasCommand,
  activityCommand,
  apiCommand,
  blobCommand,
  budgetCommand,
  bisectCommand,
  buildCommand,
  buildersCommand,
  buyCommand,
  cacheCommand,
  certsCommand,
  changelogCommand,
  ciCommand,
  commentsCommand,
  contractCommand,
  cronsCommand,
  curlCommand,
  daemonsCommand,
  deployCommand,
  deployHooksCommand,
  devCommand,
  dnsCommand,
  domainsCommand,
  drainsCommand,
  envCommand,
  experimentsCommand,
  feedbackCommand,
  firewallCommand,
  flagsCommand,
  gitCommand,
  globalConfigCommand,
  healthCommand,
  httpstatCommand,
  initCommand,
  inspectCommand,
  installCommand,
  integrationCommand,
  integrationResourceCommand,
  kmsCommand,
  linkCommand,
  listCommand,
  loginCommand,
  logoutCommand,
  logsCommand,
  mcpCommand,
  microfrontendsCommand,
  monitorsCommand,
  openCommand,
  organizationsCommand,
  pricingCommand,
  projectCommand,
  promoteCommand,
  pullCommand,
  redeployCommand,
  redirectsCommand,
  removeCommand,
  routesCommand,
  rollbackCommand,
  rollingReleaseCommand,
  sandboxCommand,
  schedulesCommand,
  securityCommand,
  setupCommand,
  signupCommand,
  skillsCommand,
  storageCommand,
  targetCommand,
  teamsCommand,
  tokensCommand,
  tokenPassCommand,
  telemetryCommand,
  tracesCommand,
  upgradeCommand,
  webhooksCommand,
  usageCommand,
  vcrCommand,
  versionCommand,
  whoamiCommand,
  // added because we don't have a full help command
  { name: 'help', aliases: [] },
];

if (process.env.FF_GUIDANCE_MODE) {
  commandsStructs.push(guidanceCommand);
}

commandsStructs.push(metricsCommand);

commandsStructs.push(connexCommand);

registerCommandPaths(commandsStructs);

export function getCommandAliases(command: Pick<Command, 'name' | 'aliases'>) {
  return [command.name].concat(command.aliases);
}

export function isHiddenCommand(name: string): boolean {
  const canonicalName = commands.get(name);
  return commandsStructs.some(
    command =>
      command.name === canonicalName &&
      'hidden' in command &&
      command.hidden === true
  );
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

export const commandNames = commandsStructs.flatMap(command =>
  'hidden' in command && command.hidden ? [] : getCommandAliases(command)
);
