import { TelemetryClient } from '../..';
import type { getSubcommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobGetTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof getSubcommand>
{
  trackCliArgumentUrlOrPathname(urlOrPathname: string | undefined) {
    if (urlOrPathname) {
      this.trackCliArgument({
        arg: 'urlOrPathname',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionAccess(access: string | undefined) {
    if (access) {
      this.trackCliOption({
        option: 'access',
        value: access,
      });
    }
  }

  trackCliOptionOutput(output: string | undefined) {
    if (output) {
      this.trackCliOption({
        option: 'output',
        value: this.redactedValue,
      });
    }
  }
}
