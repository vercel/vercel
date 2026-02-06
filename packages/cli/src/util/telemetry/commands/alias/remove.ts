import type { removeSubcommand } from '../../../../commands/alias/command';
import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';

export class AliasRemoveTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof removeSubcommand>
{
  trackCliArgumentAlias(alias: string | undefined) {
    if (alias) {
      this.trackCliArgument({
        arg: 'alias',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
