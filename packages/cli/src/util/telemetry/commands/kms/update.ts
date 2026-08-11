import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { updateSubcommand } from '../../../../commands/kms/command';

export class KmsUpdateTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof updateSubcommand>
{
  trackCliArgumentIssuerId(issuerId: string | undefined) {
    if (issuerId) {
      this.trackCliArgument({
        arg: 'issuerId',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionName(name: string | undefined) {
    if (name) {
      this.trackCliOption({
        option: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionClaimsSchema(claimsSchema: string | undefined) {
    if (claimsSchema) {
      this.trackCliOption({
        option: 'claims-schema',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagRemoveClaimsSchema(removeClaimsSchema: boolean | undefined) {
    if (removeClaimsSchema) {
      this.trackCliFlag('remove-claims-schema');
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
}
