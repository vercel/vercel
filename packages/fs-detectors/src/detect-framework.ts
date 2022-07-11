import type { Framework, FrameworkDetectionItem } from '@vercel/frameworks';
import { DetectorFilesystem } from './detectors/filesystem';
import 'promise-any-polyfill';

interface BaseFramework {
  slug: Framework['slug'];
  detectors?: Framework['detectors'];
}

export interface DetectFrameworkOptions {
  fs: DetectorFilesystem;
  frameworkList: readonly BaseFramework[];
}

async function matches(fs: DetectorFilesystem, framework: BaseFramework) {
  const { detectors } = framework;

  if (!detectors) {
    return false;
  }

  const { every, some } = detectors;

  if (every !== undefined && !Array.isArray(every)) {
    return false;
  }

  if (some !== undefined && !Array.isArray(some)) {
    return false;
  }

  const check = async ({ path, matchContent }: FrameworkDetectionItem) => {
    if (!path) {
      return false;
    }

    if ((await fs.hasPath(path)) === false) {
      return false;
    }

    if (matchContent) {
      if ((await fs.isFile(path)) === false) {
        return false;
      }

      const regex = new RegExp(matchContent, 'gm');
      const content = await fs.readFile(path);

      if (!regex.test(content.toString())) {
        return false;
      }
    }

    return true;
  };

  const result: boolean[] = [];

  if (every) {
    const everyResult = await Promise.all(every.map(item => check(item)));
    result.push(...everyResult);
  }

  if (some) {
    let someResult = false;

    for (const item of some) {
      if (await check(item)) {
        someResult = true;
        break;
      }
    }

    result.push(someResult);
  }

  return result.every(res => res === true);
}

export async function detectFramework({
  fs,
  frameworkList,
}: DetectFrameworkOptions): Promise<string | null> {
  let framework: string | null;
  try {
    framework = await Promise.any(
      frameworkList.map(async frameworkMatch => {
        if (await matches(fs, frameworkMatch)) {
          return frameworkMatch.slug;
        }
        throw new Error(`Framework not detected: "${frameworkMatch}"`);
      })
    );
  } catch (errorOrErrors: any) {
    // note the promise.any polyfill works differently from the native Promise.any!
    // it returns an array of errors instead of an `AggregateError`
    if (Array.isArray(errorOrErrors)) {
      for (const e of errorOrErrors) {
        // If it does not start with this text, we should throw the error as an
        // unexpected error has occurred
        if (!e.message.startsWith('Framework not detected:')) {
          throw e;
        }
      }
      return null;
    }
    // if it is not an array, throw the error as an unexpected error has occurred
    throw errorOrErrors;
  }
  return framework;
}
