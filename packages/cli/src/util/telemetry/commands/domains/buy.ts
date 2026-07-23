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

  trackCliOptionYears(v: number | undefined) {
    if (v !== undefined) {
      this.trackCliOption({
        option: 'years',
        value: String(v),
      });
    }
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

  /**
   * Price and registrant contact options record only that the flag was used,
   * never its value — contact information must not reach telemetry.
   */
  private redacted(option: string) {
    return (v: string | number | undefined) => {
      if (v !== undefined && v !== '') {
        this.trackCliOption({
          option,
          value: this.redactedValue,
        });
      }
    };
  }

  trackCliOptionExpectedPrice = this.redacted('expected-price');
  trackCliOptionFirstName = this.redacted('first-name');
  trackCliOptionLastName = this.redacted('last-name');
  trackCliOptionEmail = this.redacted('email');
  trackCliOptionPhone = this.redacted('phone');
  trackCliOptionAddress = this.redacted('address');
  trackCliOptionCity = this.redacted('city');
  trackCliOptionState = this.redacted('state');
  trackCliOptionZip = this.redacted('zip');
  trackCliOptionCountry = this.redacted('country');
  trackCliOptionCompany = this.redacted('company');
}
