import type Client from '../client';
import output from '../../output-manager';

/**
 * Collect the user's Visa Intelligent Commerce payment credential.
 *
 * Live behavior: masked interactive prompt (never a CLI flag, which would
 * leak into shell history and `ps` output).
 *
 * Testing/CI only: the `VERCEL_VISA_CREDENTIAL` environment variable
 * bypasses the prompt so automated tests can exercise the payment path.
 */
export default async function getVisaCredential(
  client: Client
): Promise<string> {
  const envCredential = process.env.VERCEL_VISA_CREDENTIAL;
  if (envCredential) {
    output.debug(
      'Using Visa credential from VERCEL_VISA_CREDENTIAL environment variable'
    );
    return envCredential;
  }

  return client.input.password({
    message: 'Visa payment credential:',
    mask: true,
    validate: (val: string) =>
      val.length > 0 || 'Visa payment credential is required',
  });
}
