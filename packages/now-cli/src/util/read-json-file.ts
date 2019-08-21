import fs from 'fs-extra';
import { CantParseJSONFile } from './errors-ts';

export default async function readJSONFile(
  file: string
): Promise<Object | null | CantParseJSONFile> {
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
  if (fs.existsSync(file)) {
    const content = await fs.readFile(file);
    return content.toString();
  }

  return null;
}
