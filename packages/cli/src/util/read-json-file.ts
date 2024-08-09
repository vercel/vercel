import fs from 'fs-extra';
import { CantParseJSONFile } from './errors-ts';
import JSONparse from 'json-parse-better-errors';
import { errorToString } from '@vercel/error-utils';

export default async function readJSONFile<T>(
  file: string
): Promise<T | null | CantParseJSONFile> {
  const content = await readFileSafe(file);
  if (content === null) {
    return content;
  }

  try {
    const json = JSONparse(content);
    return json;
  } catch (error) {
    return new CantParseJSONFile(file, errorToString(error));
  }
}

async function readFileSafe(file: string) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (_) {
    return null;
  }
}
