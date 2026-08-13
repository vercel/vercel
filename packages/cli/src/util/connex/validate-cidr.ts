/**
 * Validate an IPv4 CIDR block for Secure Compute networks, mirroring the
 * server-side rules so obviously-invalid input is rejected before any remote
 * call: it must parse as IPv4 CIDR, sit within a private address range, and
 * use a prefix length between /16 and /24 (inclusive).
 *
 * Throws an Error with a user-facing message when invalid.
 */
export function validateNetworkCidr(cidr: string): void {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(
    cidr.trim()
  );
  if (!match) {
    throw new Error('The provided CIDR block is not valid.');
  }

  const octets = [match[1], match[2], match[3], match[4]].map(Number);
  if (octets.some(o => o > 255)) {
    throw new Error('The provided CIDR block is not valid.');
  }

  const prefix = Number(match[5]);
  if (prefix < 16 || prefix > 24) {
    throw new Error('The provided CIDR block must be a /16 through /24 range.');
  }

  if (!isPrivateIpv4(octets)) {
    throw new Error('The provided CIDR block must be a private address range.');
  }
}

/**
 * Returns true when the address falls inside an RFC 1918 private range:
 * 10.0.0.0/8, 172.16.0.0/12, or 192.168.0.0/16.
 */
function isPrivateIpv4([a, b]: number[]): boolean {
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}
