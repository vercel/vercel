import { describe, expect, it } from 'vitest';
import { serviceTelemetryValue } from '../../../../src/util/connex/service-telemetry-value';

describe('serviceTelemetryValue', () => {
  it('passes registry slugs through unchanged', () => {
    expect(serviceTelemetryValue('slack')).toEqual('slack');
    expect(serviceTelemetryValue('github')).toEqual('github');
  });

  it('keeps the host of a bare server URL', () => {
    expect(serviceTelemetryValue('mcp.notion.com/mcp')).toEqual(
      'mcp.notion.com'
    );
    expect(serviceTelemetryValue('mcp.linear.app')).toEqual('mcp.linear.app');
  });

  it('drops the scheme, path, query, and fragment', () => {
    expect(
      serviceTelemetryValue('https://mcp.acme.com/sse?api_key=secret#frag')
    ).toEqual('mcp.acme.com');
  });

  it('drops credentials embedded in userinfo', () => {
    expect(
      serviceTelemetryValue('https://user:token@mcp.acme.com/mcp')
    ).toEqual('mcp.acme.com');
    expect(serviceTelemetryValue('user:token@mcp.acme.com')).toEqual(
      'mcp.acme.com'
    );
  });

  it('drops the port', () => {
    expect(serviceTelemetryValue('http://localhost:3000/mcp')).toEqual(
      'localhost'
    );
  });

  it('keeps IPv6 literals intact', () => {
    expect(serviceTelemetryValue('http://[::1]:3000/mcp')).toEqual('[::1]');
  });

  it('lowercases the host', () => {
    expect(serviceTelemetryValue('https://MCP.Acme.COM')).toEqual(
      'mcp.acme.com'
    );
  });

  it('returns null when no host can be derived', () => {
    expect(serviceTelemetryValue('')).toEqual(null);
    expect(serviceTelemetryValue('   ')).toEqual(null);
    expect(serviceTelemetryValue('https:///mcp')).toEqual(null);
    expect(serviceTelemetryValue('/mcp')).toEqual(null);
  });
});
