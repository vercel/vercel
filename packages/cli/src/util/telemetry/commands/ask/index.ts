import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { askCommand } from '../../../../commands/ask/command';

export class AskTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof askCommand>
{
  trackCliArgumentPrompt(value: string | undefined) {
    if (value) {
      this.trackCliArgument({
        arg: 'prompt',
        value: this.redactedValue,
      });
    }
  }

  trackCliOptionSession(value: string | undefined) {
    if (value) {
      this.trackCliOption({
        option: 'session',
        value: this.redactedValue,
      });
    }
  }

  trackCliFlagNoWait(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('no-wait');
    }
  }

  trackCliFlagVerbose(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('verbose');
    }
  }

  trackCliFlagJson(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('json');
    }
  }
}
