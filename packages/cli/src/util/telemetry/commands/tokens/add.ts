import { TelemetryClient } from '../..';
import type { addSubcommand } from '../../../../commands/tokens/command';
import type { TelemetryMethods } from '../../types';

export class TokensAddTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof addSubcommand>
{
  trackCliArgumentName(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionPermission(value: string[] | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'permission',
        value: value.join(','),
      });
    }
  }

  trackCliOptionExpiry(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'expiry',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionProject(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'project',
        value: this.redactedValue,
      });
    }
  }
}
