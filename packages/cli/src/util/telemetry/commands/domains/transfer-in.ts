import { TelemetryClient } from '../..';

export class DomainsTransferInTelemetryClient extends TelemetryClient {
  trackCliOptionCode(code: string | undefined) {
    if (code) {
      this.trackCliOption({
        flag: 'transfer-in',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentDomainName(domainName: string) {
    if (domainName) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }
}
