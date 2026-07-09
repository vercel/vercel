import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RUNTIMES,
  assertSandboxName,
  buildKeepLastSnapshots,
  buildNetworkPolicy,
  parseDuration,
  parseKeyValues,
  parseNetworkPolicyMode,
  parsePort,
  parseRuntime,
  parseSnapshotExpiration,
  parseSnapshotId,
  parseVcpus,
} from '../../../../src/util/sandbox/args';

describe('parseKeyValues', () => {
  const originalB = process.env.B;

  afterEach(() => {
    if (originalB === undefined) {
      delete process.env.B;
    } else {
      process.env.B = originalB;
    }
    vi.restoreAllMocks();
  });

  it('splits KEY=VALUE pairs and puns bare KEY to $KEY', () => {
    process.env.B = '2';
    expect(parseKeyValues(['A=1', 'B'])).toEqual({ A: '1', B: '2' });
  });

  it('splits on the first = only, keeping later = in the value', () => {
    expect(parseKeyValues(['A=x=y'])).toEqual({ A: 'x=y' });
  });

  it('omits keys with no value and warns to stderr', () => {
    delete process.env.MISSING_VAR;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(parseKeyValues(['MISSING_VAR'])).toEqual({});
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('MISSING_VAR');
    expect(errorSpy.mock.calls[0][0]).toContain(
      '--env VAR is equivalent to --env VAR=$VAR'
    );
  });
});

describe('parseDuration', () => {
  it('accepts a valid duration and returns it unmodified', () => {
    expect(parseDuration('5m')).toBe('5m');
  });

  it('throws a friendly error on malformed input', () => {
    expect(() => parseDuration('nope')).toThrow(/Malformed duration: "nope"/);
  });
});

describe('parseSnapshotExpiration', () => {
  it('maps "none" to "0"', () => {
    expect(parseSnapshotExpiration('none')).toBe('0');
  });

  it('delegates to parseDuration otherwise', () => {
    expect(parseSnapshotExpiration('7d')).toBe('7d');
  });

  it('throws the same malformed-duration error as parseDuration', () => {
    expect(() => parseSnapshotExpiration('nope')).toThrow(
      /Malformed duration: "nope"/
    );
  });
});

describe('parseRuntime', () => {
  it('accepts each of the four known runtimes', () => {
    for (const runtime of RUNTIMES) {
      expect(parseRuntime(runtime)).toBe(runtime);
    }
  });

  it('throws listing all four runtimes for an invalid value', () => {
    expect(() => parseRuntime('go')).toThrow(
      /node22.*node24.*node26.*python3\.13/
    );
  });
});

describe('parseVcpus', () => {
  it('accepts a positive integer', () => {
    expect(parseVcpus(4)).toBe(4);
  });

  it('throws for a non-positive value', () => {
    expect(() => parseVcpus(0)).toThrow(/Invalid vCPU count: 0/);
  });

  it('throws for a non-integer value', () => {
    expect(() => parseVcpus(1.5)).toThrow(/Invalid vCPU count: 1\.5/);
  });
});

describe('parsePort', () => {
  it('rejects a privileged port', () => {
    expect(() => parsePort(80)).toThrow(/Invalid port: 80/);
  });

  it('accepts a port within range', () => {
    expect(parsePort(3000)).toBe(3000);
  });

  it('rejects a port above the max', () => {
    expect(() => parsePort(70000)).toThrow(/Invalid port: 70000/);
  });
});

describe('parseNetworkPolicyMode', () => {
  it('accepts allow-all and deny-all', () => {
    expect(parseNetworkPolicyMode('allow-all')).toBe('allow-all');
    expect(parseNetworkPolicyMode('deny-all')).toBe('deny-all');
  });

  it('throws listing the valid modes for anything else', () => {
    expect(() => parseNetworkPolicyMode('block-all')).toThrow(
      /Invalid network policy mode: block-all/
    );
  });
});

describe('buildNetworkPolicy', () => {
  it('returns undefined when nothing was specified', () => {
    expect(
      buildNetworkPolicy({
        allowedDomains: [],
        allowedCIDRs: [],
        deniedCIDRs: [],
      })
    ).toBeUndefined();
  });

  it('returns the mode string when only --network-policy is given', () => {
    expect(
      buildNetworkPolicy({
        networkPolicy: 'deny-all',
        allowedDomains: [],
        allowedCIDRs: [],
        deniedCIDRs: [],
      })
    ).toBe('deny-all');
  });

  it('builds an object policy from allow/deny lists', () => {
    expect(
      buildNetworkPolicy({
        allowedDomains: ['example.com'],
        allowedCIDRs: ['10.0.0.0/8'],
        deniedCIDRs: ['10.1.0.0/16'],
      })
    ).toEqual({
      allow: ['example.com'],
      subnets: { allow: ['10.0.0.0/8'], deny: ['10.1.0.0/16'] },
    });
  });

  it('builds a subnets-only allow policy when only allowedCIDRs is given', () => {
    expect(
      buildNetworkPolicy({
        allowedDomains: [],
        allowedCIDRs: ['10.0.0.0/8'],
        deniedCIDRs: [],
      })
    ).toEqual({
      subnets: { allow: ['10.0.0.0/8'] },
    });
  });

  it('builds a subnets-only deny policy when only deniedCIDRs is given', () => {
    expect(
      buildNetworkPolicy({
        allowedDomains: [],
        allowedCIDRs: [],
        deniedCIDRs: ['10.1.0.0/16'],
      })
    ).toEqual({
      subnets: { deny: ['10.1.0.0/16'] },
    });
  });

  it('throws when --network-policy is combined with list options', () => {
    expect(() =>
      buildNetworkPolicy({
        networkPolicy: 'allow-all',
        allowedDomains: ['example.com'],
        allowedCIDRs: [],
        deniedCIDRs: [],
      })
    ).toThrow(/Cannot combine --network-policy=allow-all/);
  });
});

describe('parseSnapshotId', () => {
  it('accepts an id with the snap_ prefix', () => {
    expect(parseSnapshotId('snap_abc123')).toBe('snap_abc123');
  });

  it('throws for an id missing the snap_ prefix', () => {
    expect(() => parseSnapshotId('x')).toThrow(/Malformed snapshot ID: "x"/);
  });
});

describe('buildKeepLastSnapshots', () => {
  it('returns undefined when nothing was specified', () => {
    expect(
      buildKeepLastSnapshots({
        keepLastSnapshots: undefined,
        keepLastSnapshotsFor: undefined,
        deleteEvictedSnapshots: undefined,
      })
    ).toBeUndefined();
  });

  it('throws when keepLastSnapshotsFor is given without keepLastSnapshots', () => {
    expect(() =>
      buildKeepLastSnapshots({
        keepLastSnapshots: undefined,
        keepLastSnapshotsFor: '7d',
        deleteEvictedSnapshots: undefined,
      })
    ).toThrow(
      /--keep-last-snapshots-for and --delete-evicted-snapshots require --keep-last-snapshots/
    );
  });

  it('throws when deleteEvictedSnapshots is given without keepLastSnapshots', () => {
    expect(() =>
      buildKeepLastSnapshots({
        keepLastSnapshots: undefined,
        keepLastSnapshotsFor: undefined,
        deleteEvictedSnapshots: 'true',
      })
    ).toThrow(/require --keep-last-snapshots/);
  });

  it('throws when the count is out of range', () => {
    expect(() =>
      buildKeepLastSnapshots({
        keepLastSnapshots: 11,
        keepLastSnapshotsFor: undefined,
        deleteEvictedSnapshots: undefined,
      })
    ).toThrow(/Invalid --keep-last-snapshots value: 11/);
  });

  it('builds the full payload with expiration and deleteEvicted', () => {
    expect(
      buildKeepLastSnapshots({
        keepLastSnapshots: 3,
        keepLastSnapshotsFor: '7d',
        deleteEvictedSnapshots: 'false',
      })
    ).toEqual({
      count: 3,
      expiration: 7 * 24 * 60 * 60 * 1000,
      deleteEvicted: false,
    });
  });

  it('builds a minimal payload when only the count is given', () => {
    expect(
      buildKeepLastSnapshots({
        keepLastSnapshots: 5,
        keepLastSnapshotsFor: undefined,
        deleteEvictedSnapshots: undefined,
      })
    ).toEqual({ count: 5, expiration: undefined, deleteEvicted: undefined });
  });
});

describe('assertSandboxName', () => {
  it('returns a non-empty name unchanged', () => {
    expect(assertSandboxName('my-sandbox')).toBe('my-sandbox');
  });

  it('throws for an empty string', () => {
    expect(() => assertSandboxName('')).toThrow(/Sandbox name cannot be empty/);
  });

  it('throws for a whitespace-only string', () => {
    expect(() => assertSandboxName('   ')).toThrow(
      /Sandbox name cannot be empty/
    );
  });
});
