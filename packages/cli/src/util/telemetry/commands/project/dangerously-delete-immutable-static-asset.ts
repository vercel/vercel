import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { dangerouslyDeleteImmutableStaticAssetSubcommand } from '../../../../commands/project/command';

export class ProjectDangerouslyDeleteImmutableStaticAssetTelemetryClient
  extends TelemetryClient
  implements
    TelemetryMethods<typeof dangerouslyDeleteImmutableStaticAssetSubcommand>
{
  trackCliArgumentPath(path: string | undefined) {
    if (path) {
      this.trackCliArgument({
        arg: 'path',
        value: this.redactedValue,
      });
    }
  }
}
