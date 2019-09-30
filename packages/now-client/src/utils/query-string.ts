import { Options } from '../deploy';

export const generateQueryString = (options: Options): string => {
  if (options.force && options.teamId) {
    return `?teamId=${options.teamId}&forceNew=1`;
  } else if (options.teamId) {
    return `?teamId=${options.teamId}`;
  } else if (options.force) {
    return `?forceNew=1`;
  }

  return '';
};
