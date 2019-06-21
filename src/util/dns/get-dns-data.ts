import { DNSRecordData } from '../../types';
import textInput from '../input/text';

const RECORD_TYPES = ['A', 'AAAA', 'ALIAS', 'CAA', 'CNAME', 'MX', 'SRV', 'TXT'];

export default async function getDNSData(
  data: null | DNSRecordData
): Promise<DNSRecordData> {
  if (data) {
    return data;
  }

  // first ask for type, branch from there
  const possibleTypes = new Set(RECORD_TYPES);
  const type = (await textInput({
    label: `- Record type (${RECORD_TYPES.join(', ')}): `,
    validateValue: (v: string) =>
      Boolean(v && possibleTypes.has(v.trim().toUpperCase()))
  }))
    .trim()
    .toUpperCase();

  const name = await getRecordName(type);

  if (type === 'SRV') {
    const priority = await getNumber(`- ${type} priority: `);
    const weight = await getNumber(`- ${type} weight: `);
    const port = await getNumber(`- ${type} port: `);
    const target = await getTrimmedString(`- ${type} target: `);
    return {
      name,
      type,
      srv: {
        priority,
        weight,
        port,
        target
      }
    };
  }

  if (type === 'MX') {
    const value = await getTrimmedString(`- ${type} domain: `);
    const mxPriority = await getNumber(`- ${type} priority: `);
    return {
      name,
      type,
      value,
      mxPriority
    };
  }

  const value = await getTrimmedString(`- ${type} value: `);
  console.log(name, type, value);
  return {
    name,
    type,
    value
  };
}

async function getRecordName(type: string) {
  const input = await textInput({
    label: `- ${type} name: `
  });
  return input === '@' ? '' : input;
}

async function getNumber(label: string) {
  return Number(
    await textInput({
      label,
      validateValue: v => Boolean(v && Number(v))
    })
  );
}
async function getTrimmedString(label: string) {
  const res = await textInput({
    label,
    validateValue: v => Boolean(v && v.trim().length > 0)
  });
  return res.trim();
}
