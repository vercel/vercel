export interface PaginationOptions {
  '--next'?: number;
  '--limit'?: number;
}

export function getPaginationOpts(opts: PaginationOptions) {
  const { '--next': nextTimestamp, '--limit': limit } = opts;

  if (typeof nextTimestamp !== undefined && Number.isNaN(nextTimestamp)) {
    throw new Error('Please provide a number for option --next');
  }

  if (
    typeof limit === 'number' &&
    (!Number.isInteger(limit) || limit > 100 || limit < 1)
  ) {
    throw new Error(
      'Please provide an integer from 1 to 100 for option --limit'
    );
  }

  return [nextTimestamp, limit];
}
