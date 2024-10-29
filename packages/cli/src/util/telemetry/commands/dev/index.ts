import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { devCommand } from '../../../../commands/dev/command';

export class DevTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof devCommand>
{
  trackCliArgumentDir(dir: string | undefined) {
    if (dir) {
      this.trackCliArgument({
        arg: 'dir',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionListen(uri?: string) {
    if (uri) {
      this.trackCliOption({
        option: 'listen',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionPort(port?: string) {
    if (port) {
      this.trackCliOption({
        option: 'port',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagYes(yes?: boolean) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }

  trackCliFlagConfirm(confirm?: boolean) {
    if (confirm) {
      this.trackCliFlag('confirm');
    }
  }

  trackCliFlagHelp(help?: boolean) {
    if (help) {
      this.trackCliFlagHelp();
    }
  }
}
