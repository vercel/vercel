import fs from 'fs-extra';
import { CantParseJSONFile } from './errors-ts';

export default async function readJSONFile<T>(
  file: string
): Promise<T | null | CantParseJSONFile> {
  const content = await readFileSafe(file);
  if (content === null) {
    return content;
  }

  try {
    const json = JSON.parse(content);
    return json;
  } catch (error) {
    return new CantParseJSONFile(file);
  }
}

async function readFileSafe(file: string) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (_) {
    return null;
  }
}
