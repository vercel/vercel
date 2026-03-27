import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { deployButtonCommand } from '../../../../commands/deploy-button/command';

export class DeployButtonTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof deployButtonCommand>
{
  trackCliFlagCopy(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('copy');
    }
  }

  trackCliFlagMarkdown(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('markdown');
    }
  }

  trackCliFlagYes(v: boolean | undefined) {
    if (v) {
      this.trackCliFlag('yes');
    }
  }

  trackCliCommandDeployButton(value: string) {
    this.trackCliCommand({
      command: 'deploy-button',
      value,
    });
  }
}
