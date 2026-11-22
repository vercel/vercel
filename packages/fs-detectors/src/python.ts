import fs from 'fs';
import { debug } from '@vercel/build-utils';
import type * as PythonAnalysis from '@vercel/python-analysis';

/** Check whether a Python file defines a supported function entrypoint. */
export async function isPythonEntrypoint(fsPath: string): Promise<boolean> {
  // Required on first use: python-analysis and its dependencies are large,
  // and the Vercel CLI loads this module on startup for most commands.
  // `require` keeps loading its CommonJS build, as the import did before.
  // It stays outside the `try` so a load failure throws instead of reporting
  // every Python file as a non-entrypoint.
  const {
    findAppOrHandler,
  }: typeof PythonAnalysis = require('@vercel/python-analysis');
  try {
    const content = await fs.promises.readFile(fsPath, 'utf-8');
    return (await findAppOrHandler(content)) !== null;
  } catch (err) {
    debug(`Failed to check Python entrypoint: ${err}`);
    return false;
  }
}
