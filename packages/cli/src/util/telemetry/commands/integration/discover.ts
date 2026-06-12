import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { discoverSubcommand } from '../../../../commands/integration/command';

export class IntegrationDiscoverTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof discoverSubcommand>
{
  trackCliArgumentQuery(v: string | undefined) {
    if (v) {
      this.trackCliArgument({
        arg: 'query',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionCategory(v: string[] | undefined) {
    if (v?.length) {
      for (const _value of v) {
        this.trackCliOption({
          option: 'category',
          value: this.redactedValue,
        });
      }
    }
  }
}
