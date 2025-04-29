import pc from 'picocolors';
import type { DNSRecordData } from '@vercel-internals/types';
import type Client from '../client';
import output from '../../output-manager';

const RECORD_TYPES = ['A', 'AAAA', 'ALIAS', 'CAA', 'CNAME', 'MX', 'SRV', 'TXT'];

export default async function getDNSData(
  client: Client,
  data: null | DNSRecordData
): Promise<DNSRecordData | null> {
  if (data) {
    return data;
  }

  try {
    // first ask for type, branch from there
    const possibleTypes = new Set(RECORD_TYPES);
    const type = (
      await client.input.text({
        message: `- Record type (${RECORD_TYPES.join(', ')}): `,
        validate: (v: string) =>
          Boolean(v && possibleTypes.has(v.trim().toUpperCase())),
      })
    )
      .trim()
      .toUpperCase();

    const name = await getRecordName(client, type);

    if (type === 'SRV') {
      const priority = await getNumber(client, `- ${type} priority: `);
      const weight = await getNumber(client, `- ${type} weight: `);
      const port = await getNumber(client, `- ${type} port: `);
      const target = await getTrimmedString(client, `- ${type} target: `);
      output.log(
        `${pc.cyan(name)} ${pc.bold(type)} ${pc.cyan(
          `${priority}`
        )} ${pc.cyan(`${weight}`)} ${pc.cyan(`${port}`)} ${pc.cyan(target)}.`
      );
      return (await verifyData(client))
        ? {
            name,
            type,
            srv: {
              priority,
              weight,
              port,
              target,
            },
          }
        : null;
    }

    if (type === 'MX') {
      const mxPriority = await getNumber(client, `- ${type} priority: `);
      const value = await getTrimmedString(client, `- ${type} host: `);
      output.log(
        `${pc.cyan(name)} ${pc.bold(type)} ${pc.cyan(
          `${mxPriority}`
        )} ${pc.cyan(value)}`
      );
      return (await verifyData(client))
        ? {
            name,
            type,
            value,
            mxPriority,
          }
        : null;
    }

    const value = await getTrimmedString(client, `- ${type} value: `);
    output.log(`${pc.cyan(name)} ${pc.bold(type)} ${pc.cyan(value)}`);
    return (await verifyData(client))
      ? {
          name,
          type,
          value,
        }
      : null;
  } catch (error) {
    return null;
  }
}

async function verifyData(client: Client) {
  return client.input.confirm('Is this correct?', false);
}

async function getRecordName(client: Client, type: string) {
  const input = await client.input.text({
    message: `- ${type} name: `,
  });
  return input === '@' ? '' : input;
}

async function getNumber(client: Client, label: string) {
  return Number(
    await client.input.text({
      message: label,
      validate: v => Boolean(v && Number(v)),
    })
  );
}
async function getTrimmedString(client: Client, label: string) {
  const res = await client.input.text({
    message: label,
    validate: v => Boolean(v && v.trim().length > 0),
  });
  return res.trim();
}
