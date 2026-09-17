import { domainToASCII } from 'node:url';
import { isIP } from 'node:net';

export interface ResendDNSRecord {
  name: string;
  type: 'TXT' | 'MX' | 'CNAME';
  value: string;
  ttl: number;
  mxPriority?: number;
}

export interface ExistingDNSRecord {
  id: string;
  name: string;
  type: string;
  value: string;
  mxPriority?: number;
  priority?: number;
}

export function normalizeDomain(value: unknown): string {
  if (typeof value !== 'string' || /[\s/:?#%\\]/.test(value)) {
    throw new Error('Expected a domain name without a URL, path, or port.');
  }
  const domain = domainToASCII(value.replace(/\.$/, '')).toLowerCase();
  if (
    domain.length > 253 ||
    isIP(domain) !== 0 ||
    !domain.includes('.') ||
    !domain
      .split('.')
      .every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  ) {
    throw new Error('Expected a valid domain name.');
  }
  return domain;
}

function within(name: string, domain: string) {
  return name === domain || name.endsWith(`.${domain}`);
}

function recordName(value: unknown, sendingDomain: string, zone: string) {
  if (typeof value !== 'string') throw new Error('Each record needs a name.');
  let name = value.toLowerCase().replace(/\.$/, '');
  if (!name || name === '@') name = sendingDomain;
  else if (!within(name, sendingDomain)) {
    if (
      value.endsWith('.') ||
      within(name, zone) ||
      (name.includes('.') && !/^[a-z0-9_-]+\._domainkey$/.test(name))
    ) {
      throw new Error('A record name is outside the Resend domain.');
    }
    name = `${name}.${sendingDomain}`;
  }
  if (
    name.length > 253 ||
    !name
      .split('.')
      .every(label => /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/.test(label))
  ) {
    throw new Error('A record name is invalid.');
  }
  return name === zone ? '' : name.slice(0, -(zone.length + 1));
}

function textValue(value: string) {
  // Resend's API can return one quoted TXT string. Vercel expects its contents.
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      const decoded: unknown = JSON.parse(value);
      if (typeof decoded === 'string') value = decoded;
    } catch {
      throw new Error('Expected one TXT string, not zone-file fragments.');
    }
  }
  if (!/^[\x20-\x7e]{1,8192}$/.test(value) || !/[a-z0-9]/i.test(value)) {
    throw new Error(
      'TXT values must contain 1–8192 printable ASCII characters.'
    );
  }
  return value;
}

export function parseResendRecords(zone: string, input: unknown) {
  const response = input as { data?: unknown } | null;
  const data = (
    response && 'data' in Object(response) ? response.data : input
  ) as {
    name?: unknown;
    records?: unknown;
    capabilities?: { receiving?: unknown };
  } | null;
  const sendingDomain = normalizeDomain(data?.name);
  if (!within(sendingDomain, zone)) {
    throw new Error(
      'The Resend domain must match the DNS zone or be its subdomain.'
    );
  }
  if (
    !Array.isArray(data?.records) ||
    data.records.length < 1 ||
    data.records.length > 50
  ) {
    throw new Error('Expected a Resend domain response with 1–50 DNS records.');
  }
  const excluded: Array<{ record: string; reason: string }> = [];
  const records: ResendDNSRecord[] = data.records.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object')
      throw new Error('Invalid DNS record.');
    const record = entry as Record<string, unknown>;
    if (record.record === 'TrackingCAA') {
      throw new Error(
        'This response includes a TrackingCAA certificate policy change. Review those records manually before configuring Resend.'
      );
    }
    const allowedTypes: Record<string, string[]> = {
      SPF: ['TXT', 'MX', 'CNAME'],
      DKIM: ['TXT', 'CNAME'],
      Receiving: ['MX'],
      Tracking: ['CNAME'],
    };
    if (
      typeof record.record !== 'string' ||
      !Array.isArray(allowedTypes[record.record]) ||
      !allowedTypes[record.record].includes(String(record.type))
    ) {
      throw new Error(
        'Expected a Resend SPF, DKIM, Receiving, or Tracking record with a supported TXT, MX, or CNAME type.'
      );
    }
    if (
      record.record === 'Receiving' &&
      data.capabilities?.receiving !== 'enabled'
    ) {
      excluded.push({
        record: 'Receiving',
        reason: 'Receiving is not enabled in the response',
      });
      return [];
    }
    if (typeof record.value !== 'string')
      throw new Error('Each record needs a value.');
    const ttl =
      record.ttl === 'Auto' || record.ttl === undefined
        ? 60
        : Number(record.ttl);
    if (!Number.isInteger(ttl) || ttl < 60 || ttl > 2147483647) {
      throw new Error(
        'Record TTL must be Auto or an integer between 60 and 2147483647.'
      );
    }
    const type = record.type as ResendDNSRecord['type'];
    const name = recordName(record.name, sendingDomain, zone);
    const value =
      type === 'TXT' ? textValue(record.value) : normalizeDomain(record.value);
    if (
      type === 'MX' &&
      (!Number.isInteger(record.priority) ||
        Number(record.priority) < 0 ||
        Number(record.priority) > 65535)
    ) {
      throw new Error('MX priority must be an integer between 0 and 65535.');
    }
    return [
      {
        name,
        type,
        value,
        ttl,
        ...(type === 'MX' ? { mxPriority: record.priority as number } : {}),
      },
    ];
  });
  const unique = records.filter(
    (record, index) =>
      records.findIndex(other => sameRecord(record, other)) === index
  );
  for (const record of unique) {
    if (unique.some(other => other !== record && conflict(record, other))) {
      throw new Error('The Resend response contains conflicting DNS records.');
    }
  }
  return { sendingDomain, records: unique, excluded };
}

function sameRecord(
  wanted: ResendDNSRecord,
  existing: Omit<ExistingDNSRecord, 'id'>
) {
  const value =
    wanted.type === 'TXT'
      ? existing.value
      : existing.value.toLowerCase().replace(/\.$/, '');
  return (
    wanted.name === existing.name &&
    wanted.type === existing.type &&
    wanted.value === value &&
    (wanted.type !== 'MX' ||
      wanted.mxPriority === (existing.mxPriority ?? existing.priority))
  );
}

function conflict(
  wanted: ResendDNSRecord,
  existing: Omit<ExistingDNSRecord, 'id'>
) {
  if (wanted.name === existing.name) {
    return (
      existing.type === 'CNAME' ||
      (existing.type === 'NS' && existing.name !== '') ||
      wanted.type === 'CNAME' ||
      wanted.type === existing.type
    );
  }
  return (
    existing.name !== '' &&
    wanted.name.endsWith(`.${existing.name}`) &&
    (existing.type === 'NS' || existing.type === 'CNAME')
  );
}

export function planResendRecords(
  records: ResendDNSRecord[],
  existing: ExistingDNSRecord[],
  zone: string
) {
  const normalized = existing.map(record => {
    let name = record.name.toLowerCase().replace(/\.$/, '');
    if (name === '@' || name === zone) name = '';
    else if (name.endsWith(`.${zone}`))
      name = name.slice(0, -(zone.length + 1));
    return { ...record, name, type: record.type.toUpperCase() };
  });
  const missing: ResendDNSRecord[] = [];
  const skipped: ExistingDNSRecord[] = [];
  for (const record of records) {
    const matches = normalized.filter(
      other => other.name === record.name && sameRecord(record, other)
    );
    const conflicts = normalized.filter(
      other => !matches.includes(other) && conflict(record, other)
    );
    if (conflicts.length > 0) {
      throw new Error(
        `Existing DNS records conflict with ${record.name || '@'} ${record.type}. Review them with vercel dns ls before configuring Resend.`
      );
    }
    if (matches.length > 0) skipped.push(...matches);
    else missing.push(record);
  }
  return { missing, skipped };
}
