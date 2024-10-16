import { TelemetryClient } from '../..';

export class TeamsInviteTelemetryClient extends TelemetryClient {
  trackCliArgumentEmail(count: number) {
    if (count > 0) {
      this.trackCliArgument({
        arg: 'email',
        value: count === 1 ? 'ONE' : 'MANY',
      });
    }
  }
}
