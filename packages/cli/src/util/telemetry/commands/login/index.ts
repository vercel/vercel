import { TelemetryClient } from '../..';

export class LoginTelemetryClient extends TelemetryClient {
  /**
   * Tracks the state of the login process.
   * - `started` when the user initiates the login process.
   * - `canceled` when the user cancels the login process.
   * - `error` when the user encounters an error during the login process.
   * - `success` when the user successfully logs in.
   */
  trackState(...args: Parameters<TelemetryClient['trackLoginState']>) {
    this.trackLoginState(...args);
  }
}
