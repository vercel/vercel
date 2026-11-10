/**
 * Reduce a `create` service argument to the portion we are willing to record
 * in telemetry.
 *
 * The argument accepts either a registry slug (`slack`, `notion`) or the URL
 * of an OAuth/MCP server (`mcp.notion.com/mcp`). The host is the adoption
 * signal we want to keep, but the rest of a URL is not: MCP endpoints
 * routinely carry credentials in userinfo (`https://user:token@host/`) or in a
 * query parameter (`?api_key=...`), so everything outside the host is dropped
 * rather than emitted.
 *
 * Returns `null` when no host can be derived, so the caller can redact.
 */
export function serviceTelemetryValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  // Drop the scheme, then keep only the authority (up to the first path,
  // query, or fragment delimiter), then drop any userinfo before `@`.
  const withoutScheme = trimmed.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
  const authority = withoutScheme.split(/[/?#]/, 1)[0];
  const atIndex = authority.lastIndexOf('@');
  const hostPort = atIndex === -1 ? authority : authority.slice(atIndex + 1);

  // Strip the port, taking care not to split an IPv6 literal on its colons.
  let host: string;
  if (hostPort.startsWith('[')) {
    const end = hostPort.indexOf(']');
    host = end === -1 ? hostPort : hostPort.slice(0, end + 1);
  } else {
    host = hostPort.split(':', 1)[0];
  }

  return host ? host.toLowerCase() : null;
}
