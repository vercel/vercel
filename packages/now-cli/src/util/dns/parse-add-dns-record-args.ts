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
        return {
          domain,
          data: {
            name,
            type,
            srv: {
              priority: Number(value),
              weight: Number(args[4]),
              port: Number(args[5]),
              target: args[6]
            }
          } as SRVRecordData
        };
      }
      return null
    case 'MX':
      if (args.length === 5) {
        return {
          domain,
          data: { name, value, type, mxPriority: Number(args[4]) } as MXRecordData
        };
      }
      return null
    default:
      if (args.length === 4) {
        switch (type) {
          case 'A':
            return {
              domain,
              data: { name, value, type } as ARecordData
            };
          case 'AAAA':
            return {
              domain,
              data: { name, value, type } as AAAARecordData
            };
          case 'ALIAS':
            return {
              domain,
              data: { name, value, type } as ALIASRecordData
            };
          case 'CAA':
            return {
              domain,
              data: { name, value, type } as CAARecordData
            };
          case 'CNAME':
            return {
              domain,
              data: { name, value, type } as CNAMERecordData
            };
          case 'TXT':
            return {
              domain,
              data: { name, value, type } as TXTRecordData
            };
        }
      }
      return null
  }
  return null;
}
