import { TelemetryClient } from '../..';

export class SignupTelemetryClient extends TelemetryClient {
  trackCliOptionEmail(email: string | undefined) {
    if (email) {
      this.trackCliOption({
        option: 'email',
        value: this.redactedValue,
      });
    }
  }

  /**
   * Tracks the state of the signup process.
   * - `started` when the user initiates the signup process.
   * - `error` when the user encounters an error during the signup process.
   * - `success` when the user successfully signs up and is signed in.
   */
  trackState(...args: Parameters<TelemetryClient['trackLoginState']>) {
    this.trackLoginState(...args);
  }
}
