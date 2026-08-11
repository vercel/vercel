import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { importSubcommand } from '../../../../commands/kms/command';

export class KmsImportTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof importSubcommand>
{
  trackCliArgumentName(name: string | undefined) {
    if (name) {
      this.trackCliArgument({
        arg: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionKey(key: string | undefined) {
    if (key) {
      this.trackCliOption({
        option: 'key',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionKeyId(keyId: string | undefined) {
    if (keyId) {
      this.trackCliOption({
        option: 'key-id',
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
