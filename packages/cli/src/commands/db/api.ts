export const DB_QUERY_API_PATH = '/v1/databases/query';
export const DB_SESSIONS_API_PATH = '/v1/databases/sessions';

// Backend ownership note: the adjacent Vercel API repo already routes storage
// resource operations through services/api-storage. See api-contract.md for the
// security requirements expected from the backend implementation.

export function getDatabaseApiErrorMessage(err: unknown): string {
  if (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    err.status === 404
  ) {
    return 'Database operations are not available for this account or project yet.';
  }

  return err instanceof Error ? err.message : String(err);
}
