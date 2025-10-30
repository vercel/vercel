import CiInfo from 'ci-info';
import { TelemetryClient } from '.';

export class RootTelemetryClient extends TelemetryClient {
  trackCliExtension() {
    this.trackExtension();
  }

  trackCliDefaultDeploy(defaultDeploy: boolean) {
    if (defaultDeploy) {
      this.trackDefaultDeploy();
    }
  }

  trackCliCommandAlias(actual: string) {
    this.trackCliCommand({
      command: 'alias',
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

  trackCliCommandBuild(actual: string) {
    this.trackCliCommand({
      command: 'build',
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

  trackCliCommandDeploy(actual: string) {
    this.trackCliCommand({
      command: 'deploy',
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

  trackCliCommandGit(actual: string) {
    this.trackCliCommand({
      command: 'git',
      value: actual,
    });
  }

  trackCliCommandGuidance(actual: string) {
    this.trackCliCommand({
      command: 'guidance',
      value: actual,
    });
  }

  trackCliCommandHelp(actual: string) {
    this.trackCliCommand({
      command: 'help',
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

  trackCliCommandMicrofrontends(actual: string) {
    this.trackCliCommand({
      command: 'microfrontends',
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

  trackCliCommandRemove(actual: string) {
    this.trackCliCommand({
      command: 'remove',
      value: actual,
    });
  }

  trackCliCommandTarget(actual: string) {
    this.trackCliCommand({
      command: 'target',
      value: actual,
    });
  }

  trackCliCommandTeams(actual: string) {
    this.trackCliCommand({
      command: 'teams',
      value: actual,
    });
  }

  trackCliCommandTelemetry(actual: string) {
    this.trackCliCommand({
      command: 'telemetry',
      value: actual,
    });
  }

  trackCliCommandWhoami(actual: string) {
    this.trackCliCommand({
      command: 'whoami',
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

  trackCIVendorName() {
    this.trackCI(CiInfo.id);
  }

  trackVersion(version: string | undefined) {
    super.trackVersion(version);
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
}
