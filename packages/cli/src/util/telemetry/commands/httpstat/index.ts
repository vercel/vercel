import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { httpstatCommand } from '../../../../commands/httpstat/command';

export class HttpstatTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof httpstatCommand>
{
  trackCliArgumentUrl(url: string | undefined) {
    if (url) {
      let value: string;
      if (url.startsWith('http://') || url.startsWith('https://')) {
        value = 'full-url';
      } else if (url.startsWith('/')) {
        value = 'slash';
      } else {
        value = 'no-slash';
      }
      this.trackCliArgument({
        arg: 'url',
        value,
      });
    }
  }

  trackCliArgumentPath(path: string | undefined) {
    this.trackCliArgumentUrl(path);
  }

  trackCliOptionDeployment(deploymentId: string | undefined) {
    if (deploymentId) {
      const value =
        deploymentId.startsWith('http://') ||
        deploymentId.startsWith('https://')
          ? 'url'
          : deploymentId.startsWith('dpl_')
            ? 'dpl_'
            : 'no-prefix';
      this.trackCliOption({
        option: 'deployment',
        value,
      });
    }
  }

  trackCliOptionProtectionBypass(secret: string | undefined) {
    if (secret) {
      this.trackCliOption({
        option: 'protection-bypass',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
