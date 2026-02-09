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

  trackCliFlagRepo(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('repo');
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }

  trackCliFlagConfirm(flag: boolean | undefined) {
    if (flag) {
      this.trackCliFlag('confirm');
    }
  }

  trackCliOptionProject(project: string | undefined) {
    if (project) {
      this.trackCliOption({
        option: 'project',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionTeam(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'team',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionProjectId(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'project-id',
        value: this.redactedValue,
      });
    }
  }
}
