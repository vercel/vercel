import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { updateGrantSubcommand } from '../../../../commands/kms/command';

export class KmsUpdateGrantTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof updateGrantSubcommand>
{
  trackCliArgumentIssuerId(issuerId: string | undefined) {
    if (issuerId) {
      this.trackCliArgument({
        arg: 'issuerId',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentProjectId(projectId: string | undefined) {
    if (projectId) {
      this.trackCliArgument({
        arg: 'projectId',
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

  trackCliFlagRemoveTokenClaims(removeTokenClaims: boolean | undefined) {
    if (removeTokenClaims) {
      this.trackCliFlag('remove-token-claims');
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
