import type Client from '../../util/client';
import status from './status';

export default async function enable(client: Client) {
  client.config = {
    ...client.config,
    telemetry: {
      ...client.config.telemetry,
      enabled: true,
    },
  };

  client.writeToConfigFile();
  await status(client);
  return 0;
}
