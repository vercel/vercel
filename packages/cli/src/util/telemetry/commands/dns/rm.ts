import { TelemetryClient } from '../..';

export class DnsRmTelemetryClient extends TelemetryClient {
  trackCliArgumentRecordId(recordId: string | undefined) {
    if (recordId) {
      this.trackCliArgument({
        arg: 'recordId',
        value: this.redactedValue,
      });
    }
  }
}
