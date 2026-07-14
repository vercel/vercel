import { isIP } from 'node:net';

/**
 * Parse a CIDR string into its IP and prefix length.
 * Returns null if the format is invalid.
 */
function parseCidr(input: string): { ip: string; prefix: number } | null {
  const slashIndex = input.lastIndexOf('/');
  if (slashIndex === -1) return null;

  const ip = input.slice(0, slashIndex);
  const prefixStr = input.slice(slashIndex + 1);
  const prefix = Number.parseInt(prefixStr, 10);

  if (Number.isNaN(prefix) || prefix < 0) return null;
  if (String(prefix) !== prefixStr) return null; // reject "08", "1.5", etc.

  return { ip, prefix };
}

/**
 * Check if an IP version is 4 or 6.
 * Returns 0 if invalid.
 */
function ipVersion(ip: string): 0 | 4 | 6 {
  return isIP(ip) as 0 | 4 | 6;
}

/**
 * Validate an IP or CIDR for system bypass rules.
 *
 * Rules (matching dashboard validation):
 * - Must be a valid IPv4, IPv6, or CIDR
 * - IPv4 CIDR: minimum /16 mask (exception: 0.0.0.0/0 allowed)
 * - IPv6 CIDR: minimum /16 mask (exception: ::/0 allowed)
 *
 * Returns null if valid, or an error message string if invalid.
 */
export function validateBypassIp(input: string): string | null {
  // Plain IP address
  const version = ipVersion(input);
  if (version === 4 || version === 6) {
    return null;
  }

  // CIDR notation
  const cidr = parseCidr(input);
  if (!cidr) {
    return 'Please enter a valid IP address or CIDR.';
  }

  const cidrVersion = ipVersion(cidr.ip);
  if (cidrVersion === 0) {
    return 'Please enter a valid IP address or CIDR.';
  }

  if (cidrVersion === 4) {
    if (cidr.prefix > 32) {
      return 'Please enter a valid IP address or CIDR.';
    }
    // Allow 0.0.0.0/0 as special case (used for system mitigations)
    if (input === '0.0.0.0/0') return null;
    if (cidr.prefix < 16) {
      return 'IPv4 CIDR cannot have a net mask less than /16.';
    }
  }

  if (cidrVersion === 6) {
    if (cidr.prefix > 128) {
      return 'Please enter a valid IP address or CIDR.';
    }
    // Allow ::/0 as special case
    if (input === '::/0') return null;
    if (cidr.prefix < 16) {
      return 'IPv6 CIDR cannot have a net mask less than /16.';
    }
  }

  return null;
}

/**
 * Validate an IP or CIDR for IP blocking rules (stricter than bypass).
 *
 * Rules (matching dashboard validation):
 * - Must be a valid IPv4, IPv6, or CIDR
 * - IPv4 CIDR: minimum /16 mask, 0.0.0.0/0 NOT allowed
 * - IPv6 CIDR: minimum /48 mask, ::/0 NOT allowed
 *
 * Returns null if valid, or an error message string if invalid.
 */
export function validateBlockingIp(input: string): string | null {
  // Plain IP address
  const version = ipVersion(input);
  if (version === 4 || version === 6) {
    return null;
  }

  // CIDR notation
  const cidr = parseCidr(input);
  if (!cidr) {
    return 'Please enter a valid IP address or CIDR.';
  }

  const cidrVersion = ipVersion(cidr.ip);
  if (cidrVersion === 0) {
    return 'Please enter a valid IP address or CIDR.';
  }

  if (cidrVersion === 4) {
    if (cidr.prefix > 32) {
      return 'Please enter a valid IP address or CIDR.';
    }
    if (cidr.prefix < 16) {
      return 'IPv4 CIDR cannot have a net mask less than /16.';
    }
  }

  if (cidrVersion === 6) {
    if (cidr.prefix > 128) {
      return 'Please enter a valid IP address or CIDR.';
    }
    if (cidr.prefix < 48) {
      return 'IPv6 CIDR cannot have a net mask less than /48.';
    }
  }

  return null;
}

/**
 * Validate a hostname/domain for bypass rules.
 *
 * Accepts:
 * - "*" (wildcard for all hosts)
 * - "*.example.com" (wildcard subdomain)
 * - "example.com" (exact domain)
 * - Standard hostname: alphanumerics and hyphens, labels up to 63 chars
 *
 * Returns null if valid, or an error message string if invalid.
 */
export function validateHostname(input: string): string | null {
  const hostnameRegex =
    /^\*{1}$|^(?!-)(?:\*\.)?[A-Za-z0-9-]{1,63}(?<!-)(?:\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$/;

  if (!hostnameRegex.test(input)) {
    return 'Please enter a valid domain (e.g. example.com, *.example.com, or * for all domains).';
  }

  return null;
}

/**
 * Validate a note string.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateNote(input: string): string | null {
  if (input.length > 500) {
    return `Note must be 500 characters or less (currently ${input.length}).`;
  }
  return null;
}
