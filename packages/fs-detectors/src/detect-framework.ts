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

// "error" message used to reject the promise if no framework is detected
// under the current path

const FRAMEWORK_ERR = 'framework not detected';

export async function detectFramework({
  fs,
  frameworkList,
}: DetectFrameworkOptions): Promise<string | null> {
  let framework: string | null;
  try {
    framework = await Promise.any(
      frameworkList.map(async framework => {
        if (await matches(fs, framework)) {
          return framework.slug;
        }
        throw new Error(FRAMEWORK_ERR);
      })
    );
  } catch (errorOrErrors: any) {
    // note the promise.any polyfill works differently from the native Promise.any!
    // it returns an array of errors instead of an `AggregateError`
    if (Array.isArray(errorOrErrors)) {
      for (const e of errorOrErrors) {
        if (e.message !== FRAMEWORK_ERR) {
          throw e;
        }
      }
      return null;
    }
    throw errorOrErrors;
  }
  return framework;
}
