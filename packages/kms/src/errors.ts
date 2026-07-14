/**
 * Error thrown when a Vercel KMS request fails. Mirrors the API error envelope
 * `{ error: { code, message, ...meta } }`: `code` and `message` come from the
 * response body when present, and any remaining fields are exposed on
 * {@link VercelKmsError.metadata}.
 */
export class VercelKmsError extends Error {
  /** HTTP status code of the failed response. */
  public readonly status: number;
  /** Machine-readable error code from the API (e.g. `issuer_not_found`). */
  public readonly code: string;
  /** Any additional fields the API attached to the error envelope. */
  public readonly metadata: Record<string, unknown>;

  constructor({
    status,
    code,
    message,
    metadata = {},
  }: {
    status: number;
    code: string;
    message: string;
    metadata?: Record<string, unknown>;
  }) {
    super(message);
    this.name = 'VercelKmsError';
    this.status = status;
    this.code = code;
    this.metadata = metadata;
  }
}
