import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { addGrantSubcommand } from '../../../../commands/kms/command';

export class KmsAddGrantTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof addGrantSubcommand>
{
  trackCliArgumentIssuerId(issuerId: string | undefined) {
    if (issuerId) {
      this.trackCliArgument({
        arg: 'issuerId',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionProject(project: string | undefined) {
    if (project) {
      this.trackCliOption({
        option: 'project',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionEnvironment(environments: string[] | undefined) {
    if (environments && environments.length > 0) {
      this.trackCliOption({
        option: 'environment',
        value: String(environments.length),
      });
    }
  }

  trackCliOptionTokenClaims(tokenClaims: string | undefined) {
    if (tokenClaims) {
      this.trackCliOption({
        option: 'token-claims',
        value: this.redactedValue,
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
