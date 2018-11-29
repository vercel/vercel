//
import fs from 'fs';
import { CantParseJSONFile } from '../../util/errors';

async function readJSONFile(
  file
)                                             {
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

async function readFileSafe(file        )                         {
  return fs.existsSync(file) ? fs.promises.readFile(file) : null;
}

export default readJSONFile;
