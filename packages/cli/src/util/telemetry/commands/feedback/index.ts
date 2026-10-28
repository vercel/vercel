import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { feedbackCommand } from '../../../../commands/feedback/command';

export class FeedbackTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof feedbackCommand>
{
  trackCliArgumentNote(note: string | undefined) {
    if (note !== undefined) {
      this.trackCliArgument({ arg: 'note', value: this.redactedValue });
    }
  }

  trackCliOptionField(fields: string[] | undefined) {
    if (fields?.length) {
      this.trackCliOption({ option: 'field', value: this.redactedValue });
    }
  }
}
