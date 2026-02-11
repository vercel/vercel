import type Client from '../../util/client';

export default async function flush(_client: Client, args: string[]) {
  const url =
    process.env.VERCEL_TELEMETRY_BRIDGE_URL ||
    'https://telemetry.vercel.com/api/vercel-cli/v1/events';
  const { headers, body } = JSON.parse(args[0]);
  try {
    // Use node-fetch directly instead of client.fetch because the client's
    // HTTP agent may be HTTPS-only, but the bridge URL can be http:// in tests.
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const status = res.status;
    const cliTracked = res.headers.get('x-vercel-cli-tracked') || '';
    const wasRecorded = cliTracked === '1';

    if (status === 204) {
      if (wasRecorded) {
        // Intentionally not using `output.debug` as this command is called via a subprocess
        process.stderr.write('Telemetry event tracked');
      } else {
        process.stderr.write('Telemetry event ignored');
      }
    } else {
      process.stderr.write(
        `Failed to send telemetry events. Unexpected response from telemetry server: ${status}`
      );
    }
    return 0;
  } catch (error) {
    if (error instanceof Error) {
      process.stderr.write(`Failed to send telemetry events. ${error.message}`);
    }
    return 1;
  }
}
