import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { addSubcommand } from '../../../../commands/certs/command';

export class CertsAddTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof addSubcommand>
{
  trackCliFlagOverwrite(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('overwrite');
    }
  }

  trackCliOptionCrt(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'crt',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionKey(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'key',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionCa(v: string | undefined) {
    if (v) {
      this.trackCliOption({
        option: 'ca',
        value: this.redactedValue,
      });
    }
  }
}
