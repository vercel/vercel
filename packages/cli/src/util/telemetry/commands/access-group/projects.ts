import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { projectsSubcommand } from '../../../../commands/access-group/command';
import { ACCESS_GROUP_PROJECT_ROLES } from '../../../access-group/types';

export class AccessGroupProjectsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof projectsSubcommand>
{
  trackCliSubcommandList(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'list',
      value: actual,
    });
  }

  trackCliSubcommandAdd(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'add',
      value: actual,
    });
  }

  trackCliSubcommandUpdate(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'update',
      value: actual,
    });
  }

  trackCliSubcommandRemove(actual: string) {
    this.trackCliSubcommand({
      subcommand: 'remove',
      value: actual,
    });
  }

  trackCliArgumentGroup(group: string | undefined) {
    if (group) {
      this.trackCliArgument({
        arg: 'group',
        value: this.redactedValue,
      });
    }
  }

  trackCliArgumentProject(project: string | undefined) {
    if (project) {
      this.trackCliArgument({
        arg: 'project',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionRole(role: string | undefined) {
    if (role) {
      const known = (ACCESS_GROUP_PROJECT_ROLES as readonly string[]).includes(
        role
      );
      this.trackCliOption({
        option: 'role',
        value: known ? role : this.redactedValue,
      });
    }
  }

  trackCliFlagYes(yes: boolean | undefined) {
    if (yes) {
      this.trackCliFlag('yes');
    }
  }
}
