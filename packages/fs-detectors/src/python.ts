import fs from 'fs';
import { debug } from '@vercel/build-utils';
import { findAppOrHandler } from '@vercel/python-analysis';

/** Check whether a Python file defines a supported function entrypoint. */
export async function isPythonEntrypoint(fsPath: string): Promise<boolean> {
  try {
    const content = await fs.promises.readFile(fsPath, 'utf-8');
    return (await findAppOrHandler(content)) !== null;
  } catch (err) {
    debug(`Failed to check Python entrypoint: ${err}`);
    return false;
  }
}
