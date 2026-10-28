import type Client from '../../util/client';
import status from './status';

export default async function disable(client: Client) {
  client.config = {
    ...client.config,
    guidance: {
      ...client.config.guidance,
      enabled: false,
    },
  };

  client.writeToConfigFile();
  await status(client);
  return 0;
}
