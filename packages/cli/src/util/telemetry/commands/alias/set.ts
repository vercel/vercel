import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { setSubcommand } from '../../../../commands/alias/command';

export class AliasSetTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof setSubcommand>
{
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

  trackCliArgumentDeployment(deploymentUrl: string | undefined) {
    if (deploymentUrl) {
      this.trackCliArgument({
        arg: 'deployment-url',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentAlias(customDomain: string | undefined) {
    if (customDomain) {
      this.trackCliArgument({
        arg: 'custom-domain',
        value: this.redactedValue,
      });
    }
  }
}
