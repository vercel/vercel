import type {
  VaultSecretResponse,
  VaultErrorResponse,
  VaultEnvironment,
} from './types';
import { VaultApiError, VaultNotFoundError, VaultAuthError } from './errors';

export interface FetchSecretParams {
  baseUrl: string;
  token: string;
  teamId: string;
  path: string;
  projectId: string;
  environment: VaultEnvironment;
  version?: number;
}

export async function fetchSecret(
  params: FetchSecretParams
): Promise<VaultSecretResponse> {
  const { baseUrl, token, teamId, path, projectId, environment, version } =
    params;

  // Build URL with query parameters
  const url = new URL(`/v1/vault/${teamId}/data/${path}`, baseUrl);
  url.searchParams.set('projectId', projectId);
  url.searchParams.set('environment', environment);

  if (version !== undefined) {
    url.searchParams.set('secretVersion', version.toString());
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    // Handle different status codes
    if (response.status === 404) {
      throw new VaultNotFoundError(path);
    }

    if (response.status === 401 || response.status === 403) {
      const errorBody = await response.json().catch(() => ({}));
      throw new VaultAuthError(
        `Authentication failed: ${response.statusText}`,
        errorBody
      );
    }

    if (!response.ok) {
      // Parse error response
      let errorData: VaultErrorResponse;
      try {
        errorData = await response.json();
      } catch {
        throw new VaultApiError(
          `Vault API request failed: ${response.statusText}`,
          'unknown_error',
          response.status
        );
      }

      const firstError = errorData.errors?.[0];
      if (firstError) {
        throw new VaultApiError(
          firstError.message,
          firstError.code,
          response.status,
          firstError.details
        );
      }

      throw new VaultApiError(
        'Vault API request failed',
        'unknown_error',
        response.status
      );
    }

    // Parse successful response
    const data: VaultSecretResponse = await response.json();
    return data;
  } catch (error) {
    // Re-throw our custom errors
    if (error instanceof VaultApiError) {
      throw error;
    }

    // Wrap network errors
    throw new VaultApiError(
      'Failed to connect to Vault API',
      'network_error',
      undefined,
      undefined,
      error
    );
  }
}
