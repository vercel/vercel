import {
  DNSRecordData,
  ARecordData,
  AAAARecordData,
  ALIASRecordData,
  CAARecordData,
  CNAMERecordData,
  TXTRecordData,
  SRVRecordData,
  MXRecordData
} from '../../types';

export default function parseAddArgs(
  args: string[]
): null | { domain: string; data: DNSRecordData | null } {
  if (!args || args.length < 1) {
    return null;
  }

  const [domain, ...rest] = args;
  if (domain && rest.length === 0) {
    return {
      domain,
      data: null
    };
  }

  const name = args[1] === '@' ? '' : args[1].toString();
  const type = args[2];
  const value = args[3];

  if (!(domain && typeof name === 'string' && type)) {
    return null;
  }

  switch (type) {
    case 'SRV':
      if (args.length === 7) {
        const data: SRVRecordData = {
          name,
          type,
          srv: {
            priority: Number(value),
            weight: Number(args[4]),
            port: Number(args[5]),
            target: args[6]
          }
        }
        return { domain, data};
      }
      return null
    case 'MX':
      if (args.length === 5) {
        const data: MXRecordData = { name, type, value, mxPriority: Number(args[4]) };
        return { domain, data };
      }
      return null
      case 'A':
        if (args.length === 4) {
          const data: ARecordData = { name, value, type };
          return { domain, data };
        }
        return null
      case 'AAAA':
        if (args.length === 4) {
          const data: AAAARecordData = { name, value, type };
          return { domain, data };
        }
        return null
      case 'ALIAS':
        if (args.length === 4) {
          const data: ALIASRecordData = { name, value, type };
          return { domain, data };
        }
        return null
      case 'CAA':
        if (args.length === 4) {
          const data: CAARecordData = { name, value, type };
          return { domain, data };
        }
        return null
      case 'CNAME':
        if (args.length === 4) {
          const data: CNAMERecordData = { name, value, type };
          return { domain, data };
        }
        return null
      case 'TXT':
        if (args.length === 4) {
          const data: TXTRecordData = { name, value, type };
          return { domain, data };
        }
        return null
  }
  return null;
}
