import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { listSubcommand } from '../../../../commands/deploy-hooks/command';

export class DeployHooksLsTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof listSubcommand>
{
  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({
        option: 'format',
        value: format,
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
