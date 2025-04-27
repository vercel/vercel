import fs from 'fs-extra';
import { join } from 'path';
import type { BuildsManifest } from '../../commands/build';

export default async function getPrebuiltJson(
  directory: string
): Promise<BuildsManifest | null> {
  try {
    return await fs.readJSON(join(directory, 'builds.json'));
  } catch (error) {
    // ignoring error
  }

  return null;
}
