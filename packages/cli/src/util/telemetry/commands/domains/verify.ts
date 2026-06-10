import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { verifySubcommand } from '../../../../commands/domains/command';

export class DomainsVerifyTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof verifySubcommand>
{
  trackCliArgumentDomain(name: string | undefined) {
    if (name) {
      this.trackCliArgument({
        arg: 'domain',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagStrict(strict: boolean | undefined) {
    if (strict) {
      this.trackCliFlag('strict');
    }
  }
}
