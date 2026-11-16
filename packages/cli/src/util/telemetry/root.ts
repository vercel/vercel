import CiInfo from 'ci-info';
import { TelemetryClient } from '.';

const launchTargets = [
  'cli-support',
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-arm64-musl',
  'linux-x64',
  'linux-x64-musl',
];
const launchFallbackReasons = [
  'target_missing',
  'ENOENT',
  'EACCES',
  'ENOEXEC',
  'opt_out',
  'inherited_native_env',
  'download_failed',
];
const launchSources = ['download', 'cache'];

function oneOf(value: unknown, allowed: string[]): string {
  return typeof value === 'string' && allowed.includes(value) ? value : 'other';
}

export class RootTelemetryClient extends TelemetryClient {
  trackCliExtension() {
    this.trackExtension();
  }

  trackCliDefaultDeploy(defaultDeploy: boolean) {
    if (defaultDeploy) {
      this.trackDefaultDeploy();
    }
  }

  trackCliCommandAgent(actual: string) {
    this.trackCliCommand({
      command: 'agent',
      value: actual,
    });
  }

  trackCliCommandAgentRuns(actual: string) {
    this.trackCliCommand({
      command: 'agent-runs',
      value: actual,
    });
  }

  trackCliCommandAiGateway(actual: string) {
    this.trackCliCommand({
      command: 'ai-gateway',
      value: actual,
    });
  }

  trackCliCommandTokenPass(actual: string) {
    this.trackCliCommand({ command: 'token-pass', value: actual });
  }

  trackCliCommandAlias(actual: string) {
    this.trackCliCommand({
      command: 'alias',
      value: actual,
    });
  }

  trackCliCommandActivity(actual: string) {
    this.trackCliCommand({
      command: 'activity',
      value: actual,
    });
  }

  trackCliCommandAlerts(actual: string) {
    this.trackCliCommand({
      command: 'alerts',
      value: actual,
    });
  }

  trackCliCommandApi(actual: string) {
    this.trackCliCommand({
      command: 'api',
      value: actual,
    });
  }

  trackCliCommandBisect(actual: string) {
    this.trackCliCommand({
      command: 'bisect',
      value: actual,
    });
  }

  trackCliCommandBlob(actual: string) {
    this.trackCliCommand({
      command: 'blob',
      value: actual,
    });
  }

  trackCliCommandBudgets(actual: string) {
    this.trackCliCommand({
      command: 'budgets',
      value: actual,
    });
  }

  trackCliCommandBuild(actual: string) {
    this.trackCliCommand({
      command: 'build',
      value: actual,
    });
  }

  trackCliCommandBuy(actual: string) {
    this.trackCliCommand({
      command: 'buy',
      value: actual,
    });
  }

  trackCliCommandCache(actual: string) {
    this.trackCliCommand({
      command: 'cache',
      value: actual,
    });
  }

  trackCliCommandCerts(actual: string) {
    this.trackCliCommand({
      command: 'certs',
      value: actual,
    });
  }

  trackCliCommandCi(actual: string) {
    this.trackCliCommand({
      command: 'ci',
      value: actual,
    });
  }

  trackCliCommandChangelog(actual: string) {
    this.trackCliCommand({
      command: 'changelog',
      value: actual,
    });
  }

  trackCliCommandComments(actual: string) {
    this.trackCliCommand({
      command: 'comments',
      value: actual,
    });
  }

  trackCliCommandConnex(actual: string) {
    this.trackCliCommand({
      command: 'connect',
      value: actual,
    });
  }

  trackCliCommandContract(actual: string) {
    this.trackCliCommand({
      command: 'contract',
      value: actual,
    });
  }

  trackCliCommandCrons(actual: string) {
    this.trackCliCommand({
      command: 'crons',
      value: actual,
    });
  }

  trackCliCommandCurl(actual: string) {
    this.trackCliCommand({
      command: 'curl',
      value: actual,
    });
  }

  trackCliCommandDaemons(actual: string) {
    this.trackCliCommand({
      command: 'daemons',
      value: actual,
    });
  }

  trackCliCommandDeploy(actual: string) {
    this.trackCliCommand({
      command: 'deploy',
      value: actual,
    });
  }

  trackCliCommandDeployHooks(actual: string) {
    this.trackCliCommand({
      command: 'deploy-hooks',
      value: actual,
    });
  }

  trackCliCommandDev(actual: string) {
    this.trackCliCommand({
      command: 'dev',
      value: actual,
    });
  }

  trackCliCommandDomains(actual: string) {
    this.trackCliCommand({
      command: 'domains',
      value: actual,
    });
  }

  trackCliCommandDrains(actual: string) {
    this.trackCliCommand({
      command: 'drains',
      value: actual,
    });
  }

  trackCliCommandDns(actual: string) {
    this.trackCliCommand({
      command: 'dns',
      value: actual,
    });
  }

  trackCliCommandEnv(actual: string) {
    this.trackCliCommand({
      command: 'env',
      value: actual,
    });
  }

  trackCliCommandExperiments(actual: string) {
    this.trackCliCommand({
      command: 'experiments',
      value: actual,
    });
  }

  trackCliCommandFirewall(actual: string) {
    this.trackCliCommand({
      command: 'firewall',
      value: actual,
    });
  }

  trackCliCommandFlags(actual: string) {
    this.trackCliCommand({
      command: 'flags',
      value: actual,
    });
  }

  trackCliCommandGit(actual: string) {
    this.trackCliCommand({
      command: 'git',
      value: actual,
    });
  }

  trackCliCommandGlobalConfig(actual: string) {
    this.trackCliCommand({
      command: 'global-config',
      value: actual,
    });
  }

  trackCliCommandGuidance(actual: string) {
    this.trackCliCommand({
      command: 'guidance',
      value: actual,
    });
  }

  trackCliCommandHealth(actual: string) {
    this.trackCliCommand({
      command: 'health',
      value: actual,
    });
  }

  trackCliCommandHelp(actual: string) {
    this.trackCliCommand({
      command: 'help',
      value: actual,
    });
  }

  trackCliCommandHttpstat(actual: string) {
    this.trackCliCommand({
      command: 'httpstat',
      value: actual,
    });
  }

  trackCliCommandInit(actual: string) {
    this.trackCliCommand({
      command: 'init',
      value: actual,
    });
  }

  trackCliCommandInspect(actual: string) {
    this.trackCliCommand({
      command: 'inspect',
      value: actual,
    });
  }

  trackCliCommandInstall(actual: string) {
    this.trackCliCommand({
      command: 'install',
      value: actual,
    });
  }

  trackCliCommandIntegration(actual: string) {
    this.trackCliCommand({
      command: 'integration',
      value: actual,
    });
  }

  trackCliCommandIntegrationResource(actual: string) {
    this.trackCliCommand({
      command: 'integration-resource',
      value: actual,
    });
  }

  trackCliCommandKms(actual: string) {
    this.trackCliCommand({
      command: 'kms',
      value: actual,
    });
  }

  trackCliCommandLink(actual: string) {
    this.trackCliCommand({
      command: 'link',
      value: actual,
    });
  }

  trackCliCommandList(actual: string) {
    this.trackCliCommand({
      command: 'list',
      value: actual,
    });
  }

  trackCliCommandLogin(actual: string) {
    this.trackCliCommand({
      command: 'login',
      value: actual,
    });
  }

  trackCliCommandLogout(actual: string) {
    this.trackCliCommand({
      command: 'logout',
      value: actual,
    });
  }

  trackCliCommandLogs(actual: string) {
    this.trackCliCommand({
      command: 'logs',
      value: actual,
    });
  }

  trackCliCommandMetrics(actual: string) {
    this.trackCliCommand({
      command: 'metrics',
      value: actual,
    });
  }

  trackCliCommandMicrofrontends(actual: string) {
    this.trackCliCommand({
      command: 'microfrontends',
      value: actual,
    });
  }

  trackCliCommandMonitors(actual: string) {
    this.trackCliCommand({
      command: 'monitors',
      value: actual,
    });
  }

  trackCliCommandOpen(actual: string) {
    this.trackCliCommand({
      command: 'open',
      value: actual,
    });
  }

  trackCliCommandFeedback(actual: string) {
    this.trackCliCommand({ command: 'feedback', value: actual });
  }

  trackCliCommandPricing(actual: string) {
    this.trackCliCommand({
      command: 'pricing',
      value: actual,
    });
  }

  trackCliCommandProject(actual: string) {
    this.trackCliCommand({
      command: 'project',
      value: actual,
    });
  }

  trackCliCommandPromote(actual: string) {
    this.trackCliCommand({
      command: 'promote',
      value: actual,
    });
  }

  trackCliCommandPull(actual: string) {
    this.trackCliCommand({
      command: 'pull',
      value: actual,
    });
  }

  trackCliCommandRollback(actual: string) {
    this.trackCliCommand({
      command: 'rollback',
      value: actual,
    });
  }

  trackCliCommandRollingRelease(actual: string) {
    this.trackCliCommand({
      command: 'rolling-release',
      value: actual,
    });
  }

  trackCliCommandRedeploy(actual: string) {
    this.trackCliCommand({
      command: 'redeploy',
      value: actual,
    });
  }

  trackCliCommandRedirects(actual: string) {
    this.trackCliCommand({
      command: 'redirects',
      value: actual,
    });
  }

  trackCliCommandRoutes(actual: string) {
    this.trackCliCommand({
      command: 'routes',
      value: actual,
    });
  }

  trackCliCommandRemove(actual: string) {
    this.trackCliCommand({
      command: 'remove',
      value: actual,
    });
  }

  trackCliCommandSignup(actual: string) {
    this.trackCliCommand({
      command: 'signup',
      value: actual,
    });
  }

  trackCliCommandSkills(actual: string) {
    this.trackCliCommand({
      command: 'skills',
      value: actual,
    });
  }

  trackCliCommandSetup(actual: string) {
    this.trackCliCommand({
      command: 'setup',
      value: actual,
    });
  }

  trackCliCommandSandbox(actual: string) {
    this.trackCliCommand({
      command: 'sandbox',
      value: actual,
    });
  }

  trackCliCommandSchedules(actual: string) {
    this.trackCliCommand({
      command: 'schedules',
      value: actual,
    });
  }

  trackCliCommandSecurity(actual: string) {
    this.trackCliCommand({
      command: 'security',
      value: actual,
    });
  }

  trackCliCommandStorage(actual: string) {
    this.trackCliCommand({
      command: 'storage',
      value: actual,
    });
  }

  trackCliCommandEnvironments(actual: string) {
    this.trackCliCommand({
      command: 'environments',
      value: actual,
    });
  }

  trackCliCommandTeams(actual: string) {
    this.trackCliCommand({
      command: 'teams',
      value: actual,
    });
  }

  trackCliCommandOrganizations(actual: string) {
    this.trackCliCommand({ command: 'organizations', value: actual });
  }

  trackCliCommandTokens(actual: string) {
    this.trackCliCommand({
      command: 'tokens',
      value: actual,
    });
  }

  trackCliCommandTelemetry(actual: string) {
    this.trackCliCommand({
      command: 'telemetry',
      value: actual,
    });
  }

  trackCliCommandTraces(actual: string) {
    this.trackCliCommand({
      command: 'traces',
      value: actual,
    });
  }

  trackCliCommandWhoami(actual: string) {
    this.trackCliCommand({
      command: 'whoami',
      value: actual,
    });
  }

  trackCliCommandUpgrade(actual: string) {
    this.trackCliCommand({
      command: 'upgrade',
      value: actual,
    });
  }

  trackCliCommandVersion(actual: string) {
    this.trackCliCommand({
      command: 'version',
      value: actual,
    });
  }

  trackCliCommandWebhooks(actual: string) {
    this.trackCliCommand({
      command: 'webhooks',
      value: actual,
    });
  }

  trackCliCommandUsage(actual: string) {
    this.trackCliCommand({
      command: 'usage',
      value: actual,
    });
  }

  trackCliCommandVcr(actual: string) {
    this.trackCliCommand({
      command: 'vcr',
      value: actual,
    });
  }

  trackCPUs() {
    super.trackCPUs();
  }

  trackAgenticUse(agent: string | undefined) {
    super.trackAgenticUse(agent);
  }

  trackArch() {
    super.trackArch();
  }

  trackPlatform(): void {
    super.trackPlatform();
  }

  trackLibc(libc: string | undefined) {
    super.trackLibc(libc);
  }

  /**
   * Reads what `pkg.js` (native binary) or `dist/vc.js` recorded before
   * loading the CLI. Not `VERCEL_VC_NATIVE`: child processes inherit it.
   */
  trackCliLaunch() {
    const launch = (globalThis as Record<symbol, unknown>)[
      Symbol.for('vercel.cli.launch')
    ] as Partial<Record<string, unknown>> | undefined;
    if (launch?.runtime === 'native') {
      this.trackLaunch(
        launch.source === undefined
          ? { runtime: 'native' }
          : { runtime: 'native', source: oneOf(launch.source, launchSources) }
      );
    } else if (launch?.runtime === 'cli-support') {
      this.trackLaunch({ runtime: launch.runtime });
    } else if (launch?.runtime === 'dist') {
      this.trackLaunch({
        runtime: 'dist',
        target: oneOf(launch.target, launchTargets),
        reason: oneOf(launch.reason, launchFallbackReasons),
      });
    }
  }

  trackCIVendorName() {
    this.trackCI(CiInfo.id);
  }

  trackStdinIsTTY(isTTY: boolean) {
    super.trackStdinIsTTY(isTTY);
  }

  trackVersion(version: string | undefined) {
    super.trackVersion(version);
  }

  trackProjectId(projectId: string | undefined) {
    super.trackProjectId(projectId);
  }

  trackInvocationId(invocationId: string | undefined) {
    super.trackInvocationId(invocationId);
  }

  trackDeviceId(deviceId: string | undefined) {
    super.trackDeviceId(deviceId);
  }

  trackVercelPluginActiveSession() {
    super.trackVercelPluginActiveSession();
  }

  trackVercelPluginVersion(version: string | undefined) {
    super.trackVercelPluginVersion(version);
  }

  trackVercelPluginInstallId(installId: string | undefined) {
    super.trackVercelPluginInstallId(installId);
  }

  trackErrorStatus(status: number | string | undefined) {
    super.trackErrorStatus(status);
  }

  trackErrorCode(code: string | undefined) {
    super.trackErrorCode(code);
  }

  trackErrorSlug(slug: string | undefined) {
    super.trackErrorSlug(slug);
  }

  trackErrorAction(action: string | undefined) {
    super.trackErrorAction(action);
  }

  trackErrorServerMessage(serverMessage: string | undefined) {
    super.trackErrorServerMessage(serverMessage);
  }

  trackCliOptionCwd(cwd: string | undefined) {
    if (cwd) {
      this.trackCliOption({ option: 'cwd', value: this.redactedValue });
    }
  }

  trackCliOptionLocalConfig(localConfig: string | undefined) {
    if (localConfig) {
      this.trackCliOption({
        option: 'local-config',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionGlobalConfig(globalConfig: string | undefined) {
    if (globalConfig) {
      this.trackCliOption({
        option: 'global-config',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionScope(scope: string | undefined) {
    if (scope) {
      this.trackCliOption({
        option: 'scope',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionToken(token: string | undefined) {
    if (token) {
      this.trackCliOption({
        option: 'token',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionTeam(team: string | undefined) {
    if (team) {
      this.trackCliOption({
        option: 'team',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionApi(api: string | undefined) {
    if (api) {
      this.trackCliOption({
        option: 'api',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagDebug(debug: boolean | undefined) {
    if (debug) {
      this.trackCliFlag('debug');
    }
  }

  trackCliFlagNoColor(noColor: boolean | undefined) {
    if (noColor) {
      this.trackCliFlag('no-color');
    }
  }

  // Measures how often each old short flag is still used before a major
  // version removes it.
  trackCliDeprecatedShorthands(shorthands: readonly string[]) {
    for (const shorthand of shorthands) {
      this.trackDeprecatedShorthand(shorthand);
    }
  }
}
