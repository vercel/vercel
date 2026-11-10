import { TelemetryClient } from '../..';
import type { TelemetryMethods } from '../../types';
import type { setSubcommand } from '../../../../commands/budget/command';

export class BudgetSetTelemetryClient
  extends TelemetryClient
  implements TelemetryMethods<typeof setSubcommand>
{
  trackCliOptionAmount(amount: number | undefined) {
    if (amount !== undefined) {
      this.trackCliOption({ option: 'amount', value: this.redactedValue });
    }
  }

  trackCliFlagPause(pause: boolean | undefined) {
    if (pause) {
      this.trackCliFlag('pause');
    }
  }

  trackCliFlagNoPause(noPause: boolean | undefined) {
    if (noPause) {
      this.trackCliFlag('no-pause');
    }
  }

  trackCliOptionWebhook(webhook: string | undefined) {
    if (webhook) {
      this.trackCliOption({ option: 'webhook', value: this.redactedValue });
    }
  }

  trackCliFlagNoWebhook(noWebhook: boolean | undefined) {
    if (noWebhook) {
      this.trackCliFlag('no-webhook');
    }
  }

  trackCliOptionFormat(format: string | undefined) {
    if (format) {
      this.trackCliOption({ option: 'format', value: format });
    }
  }

  trackCliFlagJson(json: boolean | undefined) {
    if (json) {
      this.trackCliFlag('json');
    }
  }
}
