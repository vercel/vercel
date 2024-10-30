import { TelemetryClient } from '../..';

export class CertsAddTelemetryClient extends TelemetryClient {
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
