import chalk from 'chalk';
import {
  DNSRecordData,
  ARecordData,
  AAAARecordData,
  ALIASRecordData,
  CAARecordData,
  CNAMERecordData,
  TXTRecordData,
  SRVRecordData,
  MXRecordData,
} from '../../types';
import textInput from '../input/text';
import promptBool from '../input/prompt-bool';
import { Output } from '../output';

const RECORD_TYPES = [
  'A',
  'AAAA',
  'ALIAS',
  'CAA',
  'CNAME',
  'MX',
  'SRV',
  'TXT',
] as const;
const possibleTypes = new Set<string>(RECORD_TYPES);
type RecordType = typeof RECORD_TYPES[number];

export default async function getDNSData(
  output: Output,
  data: null | DNSRecordData
): Promise<DNSRecordData | null> {
  if (data) {
    return data;
  }

  try {
    // first ask for type, branch from there

    const type = (await textInput({
      label: `- Record type (${RECORD_TYPES.join(', ')}): `,
      validateValue: v => possibleTypes.has(v.trim().toUpperCase()),
    }))
      .trim()
      .toUpperCase();

    const data = await getData(output, type as RecordType);
    return data;
  } catch (error) {
    return null;
  }
}

async function getData(
  output: Output,
  type: RecordType
): Promise<DNSRecordData | null> {
  const name = await getRecordName(type);

  if (type === 'SRV') {
    const priority = await getNumber(`- ${type} priority: `);
    const weight = await getNumber(`- ${type} weight: `);
    const port = await getNumber(`- ${type} port: `);
    const target = await getTrimmedString(`- ${type} target: `);
    output.log(
      `${chalk.cyan(name)} ${chalk.bold(type)} ${chalk.cyan(
        `${priority}`
      )} ${chalk.cyan(`${weight}`)} ${chalk.cyan(`${port}`)} ${chalk.cyan(
        target
      )}.`
    );
    if (!(await verifyData())) {
      return null;
    }
    const record: SRVRecordData = {
      name,
      type,
      srv: {
        priority,
        weight,
        port,
        target,
      },
    };
    return record;
  }

  if (type === 'MX') {
    const mxPriority = await getNumber(`- ${type} priority: `);
    const value = await getTrimmedString(`- ${type} host: `);
    output.log(
      `${chalk.cyan(name)} ${chalk.bold(type)} ${chalk.cyan(
        `${mxPriority}`
      )} ${chalk.cyan(value)}`
    );
    if (!(await verifyData())) {
      return null;
    }
    const record: MXRecordData = {
      name,
      value,
      type,
      mxPriority,
    };
    return record;
  }

  const value = await getTrimmedString(`- ${type} value: `);
  output.log(`${chalk.cyan(name)} ${chalk.bold(type)} ${chalk.cyan(value)}`);
  if (!(await verifyData())) {
    return null;
  }
  const record = {
    name,
    value,
    type,
  };
  return record;
}

async function verifyData() {
  return promptBool('Is this correct?');
}

async function getRecordName(type: RecordType) {
  const input = await textInput({
    label: `- ${type} name: `,
  });
  return input === '@' ? '' : input;
}

async function getNumber(label: string) {
  return Number(
    await textInput({
      label,
      validateValue: v => Boolean(v && Number(v)),
    })
  );
}
async function getTrimmedString(label: string) {
  const res = await textInput({
    label,
    validateValue: v => Boolean(v && v.trim().length > 0),
  });
  return res.trim();
}
