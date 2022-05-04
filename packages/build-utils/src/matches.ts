import { DetectorFilesystem } from './detectors/filesystem';
import { MatchObject, DetectionItem } from './types';

export async function matches(fs: DetectorFilesystem, matchObj: MatchObject) {
  const { detectors } = matchObj;

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

  const check = async ({ path, matchContent }: DetectionItem) => {
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
    const everyResult = await Promise.all(every.map((item: DetectionItem) => check(item)));
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