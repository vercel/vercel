import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { curlCommand } from '../../../../commands/curl/command';

export class CurlTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof curlCommand>
{
  trackCliArgumentPath(path: string | undefined) {
    if (path) {
      // Track whether path starts with / or not
      const value = path.startsWith('/') ? 'slash' : 'no-slash';
      this.trackCliArgument({
        arg: 'path',
        value,
      });
    }
  }

  trackCliOptionDeployment(deploymentId: string | undefined) {
    if (deploymentId) {
      // Track whether value is a URL, or if dpl_ prefix was provided
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

  trackCliFlagTrace(trace: boolean | undefined) {
    if (trace) {
      this.trackCliFlag('trace');
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }

  /**
   * Fired only when --yes is supplied AND the target is a production
   * deployment. Lets us distinguish "user explicitly confirmed prod via
   * --yes" from generic --yes usage on previews.
   */
  trackCliFlagYesOnProduction(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('yes-on-production');
    }
  }
}
