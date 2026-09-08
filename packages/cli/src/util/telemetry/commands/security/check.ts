import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { checkSubcommand } from '../../../../commands/security/command';

export class SecurityCheckTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof checkSubcommand>
{
  trackCliArgumentCheck(checks: string[]) {
    if (checks.length > 0) {
      this.trackCliArgument({
        arg: 'check',
        value: checks.join(','),
      });
    }
  }

  trackCliFlagFindings(findings: boolean | undefined) {
    if (findings) {
      this.trackCliFlag('findings');
    }
  }

  trackCliOptionLimit(limit: number | undefined) {
    if (limit !== undefined) {
      this.trackCliOption({
        option: 'limit',
        value: String(limit),
      });
    }
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({
        option: 'format',
        value: format,
      });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
