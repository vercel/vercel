import { describe, expect, it } from 'vitest';
import {
  normalizeDomain,
  parseResendRecords,
  planResendRecords,
} from '../../../../src/util/dns/resend-records';

const spf = {
  record: 'SPF',
  name: 'send',
  type: 'TXT',
  value: 'v=spf1 include:amazonses.com ~all',
  ttl: 'Auto',
};
const mx = {
  record: 'SPF',
  name: 'send',
  type: 'MX',
  value: 'feedback-smtp.us-east-1.amazonses.com',
  priority: 10,
  ttl: 'Auto',
};
const dkim = {
  record: 'DKIM',
  name: 'resend._domainkey',
  type: 'TXT',
  value: 'p=synthetic-public-dkim-key',
  ttl: 'Auto',
};
const input = (records: unknown[] = [spf, mx, dkim], name = 'example.com') => ({
  name,
  records,
});
const parsed = () => parseResendRecords('example.com', input()).records;

describe('Resend DNS records', () => {
  it('maps the documented response without copying other provider fields', () => {
    expect(
      parseResendRecords('example.com', {
        ...input(),
        id: 'domain-test',
        status: 'pending',
        email: 'unused@example.com',
      })
    ).toEqual({
      sendingDomain: 'example.com',
      excluded: [],
      records: [
        { name: 'send', type: 'TXT', value: spf.value, ttl: 60 },
        { name: 'send', type: 'MX', value: mx.value, ttl: 60, mxPriority: 10 },
        { name: 'resend._domainkey', type: 'TXT', value: dkim.value, ttl: 60 },
      ],
    });
  });
  it('accepts the data envelope used by clients', () => {
    expect(
      parseResendRecords('example.com', { data: input(), error: null }).records
    ).toEqual(parsed());
  });
  it('maps relative and fully qualified names for a sending subdomain', () => {
    const result = parseResendRecords(
      'example.com',
      input(
        [
          spf,
          { ...mx, name: 'SEND.UPDATES.EXAMPLE.COM.' },
          { ...dkim, name: 'resend._domainkey.updates.example.com' },
          {
            record: 'Tracking',
            name: 'links.updates.example.com',
            type: 'CNAME',
            value: 'LINKS1.RESEND-DNS.COM.',
          },
          { ...dkim, name: '@' },
        ],
        'UPDATES.EXAMPLE.COM.'
      )
    );
    expect(result.records.map(r => r.name)).toEqual([
      'send.updates',
      'send.updates',
      'resend._domainkey.updates',
      'links.updates',
      'updates',
    ]);
    expect(result.records[3].value).toBe('links1.resend-dns.com');
  });
  it('normalizes zone and sending domain IDNs without URL coercion', () => {
    expect(normalizeDomain('BÜCHER.DE.')).toBe('xn--bcher-kva.de');
  });
  it.each([
    '127.0.0.1',
    '123.0x01',
    'https://example.com',
    'example.com:443',
    'example.com/path',
    'example.com?x',
    'example.com#x',
    'example%2ecom',
    'example..com',
    '-bad.com',
    'example.com..',
    '*.example.com',
    'example.com\n',
    'example.com\\bad',
    'example',
  ])('rejects unsafe zone %s', value => {
    expect(() => normalizeDomain(value)).toThrow();
  });
  it.each([
    'other.com',
    'notexample.com',
    'example.com.evil.test',
  ])('rejects a response for %s', name => {
    expect(() => parseResendRecords('example.com', input([spf], name))).toThrow(
      'match the DNS zone'
    );
  });
  it.each([
    'other.example.com.',
    'other.example.com',
    'send.evil.test.',
    'send.evil.test',
    'nested.other.net',
    'send..updates',
    'send\n',
    '*',
    '_bad/label',
  ])('rejects out-of-domain or invalid record %s', name => {
    expect(() =>
      parseResendRecords(
        'example.com',
        input([{ ...spf, name }], 'updates.example.com')
      )
    ).toThrow();
  });
  it('decodes one quoted TXT string and preserves case and spaces', () => {
    expect(
      parseResendRecords(
        'example.com',
        input([{ ...spf, value: '"v=spf1 include:amazonses.com ~all"' }])
      ).records[0].value
    ).toBe(spf.value);
  });
  it.each([
    '"part one" "part two"',
    'value\nnew',
    'non-ascii-☃',
    '',
    'x'.repeat(8193),
  ])('rejects invalid TXT encoding', value => {
    expect(() =>
      parseResendRecords('example.com', input([{ ...spf, value }]))
    ).toThrow();
  });
  it.each([
    undefined,
    -1,
    65536,
    1.5,
    '10',
    null,
  ])('rejects invalid MX priority %s', priority => {
    expect(() =>
      parseResendRecords('example.com', input([{ ...mx, priority }]))
    ).toThrow('MX priority');
  });
  it.each([0, 65535])('preserves MX priority %s', priority => {
    expect(
      parseResendRecords('example.com', input([{ ...mx, priority }])).records[0]
        .mxPriority
    ).toBe(priority);
  });
  it.each([
    'https://mail.example.com',
    'mail.example.com/path',
    'mail.example.com..',
    '10 mail.example.com',
    '.',
  ])('rejects non-hostname MX targets', value => {
    expect(() =>
      parseResendRecords('example.com', input([{ ...mx, value }]))
    ).toThrow();
  });
  it.each([
    null,
    {},
    { name: 'example.com', records: [] },
    input(Array(51).fill(spf)),
    input([{ ...spf, type: 'A' }]),
    input([{ ...spf, ttl: 59 }]),
    input([{ ...spf, ttl: 2147483648 }]),
    input([{ ...spf, value: 123 }]),
  ])('rejects invalid provider data', value => {
    expect(() => parseResendRecords('example.com', value)).toThrow();
  });
  it('preserves explicit TTL and deduplicates identical records', () => {
    const result = parseResendRecords(
      'example.com',
      input([
        { ...spf, ttl: '300' },
        { ...spf, ttl: 300 },
      ])
    );
    expect(result.records).toHaveLength(1);
    expect(result.records[0].ttl).toBe(300);
  });
  it('rejects conflicting records inside the file before planning', () => {
    expect(() =>
      parseResendRecords(
        'example.com',
        input([spf, { ...spf, value: 'v=spf1 -all' }])
      )
    ).toThrow('conflicting');
  });
  it('preserves unrelated records and skips exact matches independent of TTL', () => {
    expect(
      planResendRecords(
        parsed(),
        [
          { id: 'website', name: '', type: 'A', value: '192.0.2.1' },
          {
            id: 'mail',
            name: 'SEND',
            type: 'MX',
            value: `${mx.value.toUpperCase()}.`,
            mxPriority: 10,
          },
          {
            id: 'other-txt',
            name: '_acme-challenge',
            type: 'TXT',
            value: 'synthetic',
          },
        ],
        'example.com'
      )
    ).toMatchObject({
      missing: [parsed()[0], parsed()[2]],
      skipped: [{ id: 'mail' }],
    });
  });
  it.each([
    { name: 'send', type: 'MX', value: 'mail.existing.test', mxPriority: 10 },
    { name: 'send', type: 'TXT', value: 'v=spf1 include:other.test ~all' },
    { name: 'resend._domainkey', type: 'TXT', value: 'p=other-public-key' },
    { name: 'send', type: 'CNAME', value: 'existing.test' },
    { name: 'send', type: 'NS', value: 'ns.external.test' },
  ])('rejects existing conflicts without deleting or replacing', existing => {
    expect(() =>
      planResendRecords(
        parsed(),
        [{ id: 'existing', ...existing }],
        'example.com'
      )
    ).toThrow('conflict');
  });
  it('does not hide a conflict when one exact match is also present', () => {
    expect(() =>
      planResendRecords(
        parsed(),
        [
          { id: 'match', ...parsed()[0] },
          { id: 'conflict', ...parsed()[0], value: 'v=spf1 -all' },
        ],
        'example.com'
      )
    ).toThrow('conflict');
  });
  it.each([
    'NS',
    'CNAME',
  ])('rejects records below existing %s delegation', type => {
    const records = parseResendRecords(
      'example.com',
      input([spf], 'updates.example.com')
    ).records;
    expect(() =>
      planResendRecords(
        records,
        [{ id: 'delegation', name: 'updates', type, value: 'external.test' }],
        'example.com'
      )
    ).toThrow('conflict');
  });
  it.each([
    '@',
    'EXAMPLE.COM.',
    '',
  ])('recognizes an exact apex record (%s)', name => {
    const records = parseResendRecords(
      'example.com',
      input([{ ...spf, name: '@' }])
    ).records;
    expect(
      planResendRecords(
        records,
        [{ id: 'apex', name, type: 'TXT', value: spf.value }],
        'example.com'
      ).missing
    ).toHaveLength(0);
  });
  it.each([
    'disabled',
    undefined,
  ])('excludes receiving MX unless explicitly enabled (%s)', receiving => {
    const result = parseResendRecords('example.com', {
      ...input([
        spf,
        {
          ...mx,
          record: 'Receiving',
          name: 'example.com',
          value: 'inbound-mx.resend.com',
        },
      ]),
      capabilities: { sending: 'enabled', receiving },
    });
    expect(result.records).toEqual([parsed()[0]]);
    expect(result.excluded).toEqual([
      {
        record: 'Receiving',
        reason: 'Receiving is not enabled in the response',
      },
    ]);
  });
  it('preserves explicitly enabled receiving while respecting existing inbound mail', () => {
    const result = parseResendRecords('example.com', {
      ...input([
        {
          ...mx,
          record: 'Receiving',
          name: 'example.com',
          value: 'inbound-mx.resend.com',
        },
      ]),
      capabilities: { receiving: 'enabled' },
    });
    expect(result.records[0]).toMatchObject({
      name: '',
      type: 'MX',
      value: 'inbound-mx.resend.com',
      mxPriority: 10,
    });
    expect(() =>
      planResendRecords(
        result.records,
        [
          {
            id: 'existing-inbound',
            name: '',
            type: 'MX',
            value: 'mail.original.test',
            mxPriority: 10,
          },
        ],
        'example.com'
      )
    ).toThrow('conflict');
  });
  it('fails before any configuration for a TrackingCAA policy change', () => {
    expect(() =>
      parseResendRecords(
        'example.com',
        input([
          spf,
          {
            record: 'TrackingCAA',
            name: '',
            type: 'CAA',
            value: '0 issue "amazon.com"',
          },
        ])
      )
    ).toThrow('certificate policy');
  });
  it('allows valid apex records alongside authoritative apex NS', () => {
    const records = parseResendRecords(
      'example.com',
      input([{ ...spf, name: '@' }])
    ).records;
    expect(
      planResendRecords(
        records,
        [{ id: 'ns', name: '', type: 'NS', value: 'ns1.vercel-dns.com' }],
        'example.com'
      ).missing
    ).toEqual(records);
  });
  it.each([
    '"v=spf1 include:amazonses.com ~all"',
    '"v=spf1 " "include:amazonses.com ~all"',
  ])('fails explicitly on differing stored TXT representation', value => {
    expect(() =>
      planResendRecords(
        parsed(),
        [{ id: 'existing-txt', name: 'send', type: 'TXT', value }],
        'example.com'
      )
    ).toThrow('conflict');
  });
});
