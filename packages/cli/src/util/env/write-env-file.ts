import { outputFile } from 'fs-extra';
import { CONTENTS_PREFIX, VARIABLES_TO_IGNORE } from './constants';
import { escapeValue } from './escape-value';

export async function writeEnvFile(
  fullPath: string,
  records: Record<string, string>
): Promise<void> {
  const contents =
    CONTENTS_PREFIX +
    Object.keys(records)
      .sort()
      .filter(key => !VARIABLES_TO_IGNORE.includes(key))
      .map(key => `${key}="${escapeValue(records[key])}"`)
      .join('\n') +
    '\n';

  await outputFile(fullPath, contents, 'utf8');
}
