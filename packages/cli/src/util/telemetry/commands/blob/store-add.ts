import { TelemetryClient } from '../..';
import type { addStoreSubcommand } from '../../../../commands/blob/command';
import type { TelemetryMethods } from '../../types';

export class BlobAddStoreTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof addStoreSubcommand>
{
  trackCliOptionAccess(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'access',
        value,
      });
    }
  }

  trackCliArgumentName(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'name',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionRegion(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'region',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('yes');
    }
  }

  trackCliOptionEnvironment(value: string[] | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'environment',
        value: value.join(','),
      });
    }
  }
}
