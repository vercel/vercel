export interface Options {
  '--next'?: number;
  '--limit'?: number;
}

export function getPaginationOpts(opts: Options) {
  const { '--next': nextTimestamp, '--limit': limit } = opts;

  if (typeof nextTimestamp !== undefined && Number.isNaN(nextTimestamp)) {
    throw new Error('Please provide a number for flag --next');
  }

  if (
    typeof limit === 'number' &&
    (!Number.isInteger(limit) || limit > 100 || limit < 1)
  ) {
    throw new Error('Please provide a number up to 100 for flag --limit');
  }

  return { nextTimestamp, limit };
}
