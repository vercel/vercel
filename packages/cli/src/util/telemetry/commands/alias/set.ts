import { TelemetryClient } from '../..';

export class AliasSetTelemetryClient extends TelemetryClient {
  trackCliFlagDebug(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('debug');
    }
  }

  trackCliOptionLocalConfig(localConfig?: string) {
    if (localConfig) {
      this.trackCliOption({
        flag: 'local-config',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentDeploymentUrl(deploymentUrl?: string) {
    if (deploymentUrl) {
      this.trackCliArgument({
        arg: 'deployment-url',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentCustomDomain(customDomain?: string) {
    if (customDomain) {
      this.trackCliArgument({
        arg: 'custom-domain',
        value: this.redactedValue,
      });
    }
  }
}
