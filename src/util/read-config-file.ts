import fs from 'fs';
import { CantParseJSONFile } from './errors-ts';

export default {
  json: async (
    file: string
  ): Promise<Object | null | CantParseJSONFile> => {
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
  },
  js: async (
    file: string
  ): Promise<Object | null> => {
    const content = await import(file);
    return content;
  }
}

async function readFileSafe(file: string) {
  if (fs.existsSync(file)) {
    const content = await fs.promises.readFile(file);
    return content.toString();
  }

  return null;
}
