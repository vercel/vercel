import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { tokensSubcommand } from '../../../../commands/edge-config/command';

export class EdgeConfigTokensTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof tokensSubcommand>
{
  trackCliArgumentIdOrSlug(value: string | undefined) {
    this.trackCliArgument({ arg: 'id-or-slug', value });
  }

  trackCliOptionAdd(value: string | undefined) {
    if (value) {
      this.trackCliOption({ option: 'add', value: this.redactedValue });
    }
  }

  trackCliOptionRemove(values: string[] | undefined) {
    if (values?.length) {
      this.trackCliOption({
        option: 'remove',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
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
