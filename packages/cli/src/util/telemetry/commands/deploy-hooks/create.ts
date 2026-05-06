import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { createSubcommand } from '../../../../commands/deploy-hooks/command';

export class DeployHooksCreateTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof createSubcommand>
{
  trackCliArgumentName(name: string | undefined) {
    if (name) {
      this.trackCliArgument({
        arg: 'name',
        value: name,
      });
    }
  }

  trackCliOptionRef(ref: string | undefined) {
    if (ref) {
      this.trackCliOption({
        option: 'ref',
        value: ref,
      });
    }
  }

  trackCliOptionProject(project: string | undefined) {
    if (project) {
      this.trackCliOption({
        option: 'project',
        value: project,
      });
    }
  }
}
