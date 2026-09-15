import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { dangerouslyDeleteImmutableStaticSubcommand } from '../../../../commands/cache/command';

export class CacheDangerouslyDeleteImmutableStaticTelemetryClient
  extends TelemetryClient
  implements
    TelemetryMethods<typeof dangerouslyDeleteImmutableStaticSubcommand>
{
  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }

  trackCliArgumentPath(path: string | undefined) {
    if (path) {
      this.trackCliArgument({
        arg: 'path',
        value: path,
      });
    }
  }
}
