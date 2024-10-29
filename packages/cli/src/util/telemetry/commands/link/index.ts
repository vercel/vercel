import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { linkCommand } from '../../../../commands/link/command';

export class LinkTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof linkCommand>
{
  trackCliArgumentCwd() {
    this.trackCliArgument({
      arg: 'cwd',
      value: this.redactedValue,
    });
  }

  trackCliFlagRepo(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('repo');
    }
  }

  trackCliFlagYes(yes?: boolean) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }

  trackCliFlagConfirm(flag?: boolean) {
    if (flag) {
      this.trackCliFlag('confirm');
    }
  }

  trackCliOptionProject(project?: string) {
    if (project) {
      this.trackCliOption({
        option: 'project',
        value: this.redactedValue,
      });
    }
  }
}
