export const SCHEDULE_FUNCTION_PREFIX = '_vercel/schedules';

/** Build-output path for a function generated from a schedule entrypoint. */
export function getScheduleFunctionPath(entrypointSegments: string[]): string {
  if (
    entrypointSegments.length === 0 ||
    entrypointSegments.some(
      segment =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.includes('/') ||
        segment.includes('\\')
    )
  ) {
    throw new Error('Schedule function paths require safe, non-empty segments');
  }
  return [SCHEDULE_FUNCTION_PREFIX, ...entrypointSegments].join('/');
}
