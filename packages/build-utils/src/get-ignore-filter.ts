import path from 'node:path';
import fs from 'fs-extra';
import ignore from 'ignore';

interface CodedError extends Error {
  code: string;
}

function isCodedError(error: unknown): error is CodedError {
  return (
    error !== null &&
    error !== undefined &&
    (error as CodedError).code !== undefined
  );
}

function clearRelative(s: string) {
  return s.replace(/(\n|^)\.\//g, '$1');
}

export default async function (
  downloadPath: string,
  rootDirectory?: string | undefined
) {
  const readFile = async (p: string) => {
    try {
      return await fs.readFile(p, 'utf8');
    } catch (error: any) {
      if (
        error.code === 'ENOENT' ||
        (error instanceof Error && error.message.includes('ENOENT'))
      ) {
        return undefined;
      }

      throw error;
    }
  };

  const vercelIgnorePath = path.join(
    downloadPath,
    rootDirectory || '',
    '.vercelignore'
  );
  const nowIgnorePath = path.join(
    downloadPath,
    rootDirectory || '',
    '.nowignore'
  );
  const ignoreContents = [];

  try {
    ignoreContents.push(
      ...(
        await Promise.all([readFile(vercelIgnorePath), readFile(nowIgnorePath)])
      ).filter(Boolean)
    );
  } catch (error) {
    if (isCodedError(error) && error.code === 'ENOTDIR') {
      console.log(`Warning: Cannot read ignore file from ${vercelIgnorePath}`);
    } else {
      throw error;
    }
  }

  if (ignoreContents.length === 2) {
    throw new Error(
      'Cannot use both a `.vercelignore` and `.nowignore` file. Please delete the `.nowignore` file.'
    );
  }

  if (ignoreContents.length === 0) {
    return () => false;
  }

  const ignoreFilter: any = ignore().add(clearRelative(ignoreContents[0]!));

  return function (p: string) {
    // we should not ignore now.json and vercel.json if it asked to.
    // we depend on these files for building the app with sourceless
    if (p === 'now.json' || p === 'vercel.json') return false;
    return ignoreFilter.test(p).ignored;
  };
}
