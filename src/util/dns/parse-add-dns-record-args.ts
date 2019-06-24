import { DNSRecordData } from '../../types';

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

  if (type === 'MX' && args.length === 5) {
    return {
      domain,
      data: { name, type, value, mxPriority: Number(args[4]) }
    };
  }

  if (type === 'SRV' && args.length === 7) {
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
      }
    };
  }

  if (args.length === 4) {
    return {
      domain,
      data: {
        name,
        type,
        value
      }
    };
  }

  return null;
}
