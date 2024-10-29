import { TelemetryClient } from '../..';

export class AliasSetTelemetryClient extends TelemetryClient {
  trackCliFlagDebug(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('debug');
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

  trackCliArgumentDeploymentUrl(deploymentUrl: string | undefined) {
    if (deploymentUrl) {
      this.trackCliArgument({
        arg: 'deployment-url',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentCustomDomain(customDomain: string | undefined) {
    if (customDomain) {
      this.trackCliArgument({
        arg: 'custom-domain',
        value: this.redactedValue,
      });
    }
  }
}
