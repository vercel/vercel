import fs from 'fs-extra';
import { join } from 'path';

export default async function getPrebuiltJson(directory: string) {
  try {
    return await fs.readJSON(join(directory, '.vercel/output/builds.json'));
  } catch (error) {
    // ignoring error
  }

  return null;
}
