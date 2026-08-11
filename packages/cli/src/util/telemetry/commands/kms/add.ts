import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { addSubcommand } from '../../../../commands/kms/command';

export class KmsAddTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof addSubcommand>
{
  trackCliArgumentName(name: string | undefined) {
    if (name) {
      this.trackCliArgument({
        arg: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionAlgorithm(algorithm: string | undefined) {
    if (algorithm) {
      this.trackCliOption({
        option: 'algorithm',
        value: algorithm,
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

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({
        option: 'format',
        value: format,
      });
    }
  }
}
