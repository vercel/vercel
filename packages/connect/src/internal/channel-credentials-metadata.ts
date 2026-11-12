import type { VercelConnectMetadata } from '../eve/connection-authorization.js';

export interface ConnectChannelMetadata {
  readonly vercelConnect: VercelConnectMetadata;
}

export function channelCredentialsMetadata(
  connector: string,
  service: string,
  method: string = service
): ConnectChannelMetadata {
  return {
    vercelConnect: {
      connector,
      requirement: {
        method,
        reference: `connector:${connector}`,
        service,
        subjectTypes: ['app'],
      },
    },
  };
}
