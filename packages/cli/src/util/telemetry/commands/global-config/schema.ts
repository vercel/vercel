import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { schemaSubcommand } from '../../../../commands/global-config/command';

export class GlobalConfigSchemaTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof schemaSubcommand>
{
  trackCliArgumentAction(value: string | undefined) {
    // Only known actions are recorded; unknown input is dropped so we never
    // capture arbitrary user-supplied strings.
    this.trackCliArgument({ arg: 'action', value });
  }

  trackCliArgumentIdOrSlug(value: string | undefined) {
    this.trackCliArgument({ arg: 'id-or-slug', value });
  }

  trackCliArgumentFile(value: string | undefined) {
    // A file path can reveal local filesystem structure, so record only that
    // one was provided, never its value. Schema contents are never recorded.
    this.trackCliArgument({
      arg: 'file',
      value: value ? this.redactedValue : undefined,
    });
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

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
