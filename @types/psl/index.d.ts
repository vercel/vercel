declare module 'psl' {
  /**
   * Result returned when a given domain name was not parsable (not exported)
   */
  export interface ErrorResult<T extends keyof errorCodes> {
    input: string;
    error: {
      error: T;
      message: errorCodes[T];
    };
  }

  /**
   * Error codes and descriptions for domain name parsing errors
   */
  export const enum errorCodes {
    DOMAIN_TOO_SHORT = 'Domain name too short',
    DOMAIN_TOO_LONG = 'Domain name too long. It should be no more than 255 chars.',
    LABEL_STARTS_WITH_DASH = 'Domain name label can not start with a dash.',
    LABEL_ENDS_WITH_DASH = 'Domain name label can not end with a dash.',
    LABEL_TOO_LONG = 'Domain name label should be at most 63 chars long.',
    LABEL_TOO_SHORT = 'Domain name label should be at least 1 character long.',
    LABEL_INVALID_CHARS = 'Domain name label can only contain alphanumeric characters or dashes.'
  }

  /**
   * Parse a domain name and return its components
   */
  export function parse(
    input: string
  ): {
    input: string;
    tld: string | null;
    sld: string | null;
    domain: string | null;
    subdomain: string | null;
    listed: boolean;
  };

  /**
   * Get the base domain for full domain name
   */
  export function get(domain: string): string | null;

  /**
   * Check whether the given domain belongs to a known public suffix
   */
  export function isValid(domain: string): boolean;
}
