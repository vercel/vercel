import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { buySubcommand } from '../../../../commands/domains/command';

export class DomainsBuyTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof buySubcommand>
{
  trackCliArgumentDomain(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionAmount(v: string | undefined) {
    this.trackRedactedCliOption('amount', v);
  }

  trackCliFlagUseBillingDetails(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('use-billing-details');
    }
  }

  // Contact details are personal information, so only their presence is
  // recorded.
  trackCliOptionFirstName(v: string | undefined) {
    this.trackRedactedCliOption('first-name', v);
  }

  trackCliOptionLastName(v: string | undefined) {
    this.trackRedactedCliOption('last-name', v);
  }

  trackCliOptionEmail(v: string | undefined) {
    this.trackRedactedCliOption('email', v);
  }

  trackCliOptionPhone(v: string | undefined) {
    this.trackRedactedCliOption('phone', v);
  }

  trackCliOptionAddress(v: string | undefined) {
    this.trackRedactedCliOption('address', v);
  }

  trackCliOptionCity(v: string | undefined) {
    this.trackRedactedCliOption('city', v);
  }

  trackCliOptionState(v: string | undefined) {
    this.trackRedactedCliOption('state', v);
  }

  trackCliOptionZip(v: string | undefined) {
    this.trackRedactedCliOption('zip', v);
  }

  trackCliOptionCountry(v: string | undefined) {
    this.trackRedactedCliOption('country', v);
  }

  trackCliOptionCompany(v: string | undefined) {
    this.trackRedactedCliOption('company', v);
  }

  trackCliFlagAutoRenew(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('auto-renew');
    }
  }

  trackCliFlagNoAutoRenew(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('no-auto-renew');
    }
  }

  trackCliFlagJson(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('json');
    }
  }
}
