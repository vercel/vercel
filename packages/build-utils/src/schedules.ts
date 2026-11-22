import type { Schedule, ScheduleDefinition, Schedules } from './types';

/**
 * A `vercel.json` schedule without its name, which is its key in `schedules`.
 * `entrypoint` targets are resolved to `function` before the schedule reaches
 * Build Output.
 */
export type VercelJsonScheduleDefinition =
  | ScheduleDefinition
  | (Pick<ScheduleDefinition, 'schedule' | 'timezone' | 'jitter'> & {
      entrypoint: string;
      /** Command for a Dockerfile or Containerfile schedule entrypoint. */
      command?: string[];
      /** Directory of a command schedule's service; `entrypoint` is relative to it. */
      root?: string;
    });

/** `vercel.json#schedules`: schedules keyed by name. */
export type VercelJsonSchedules = Record<string, VercelJsonScheduleDefinition>;

/** A `vercel.json` schedule with its name. */
export type VercelJsonSchedule = {
  name: string;
} & VercelJsonScheduleDefinition;

/** The schedules in `schedules` with their names, in key order. */
export function getNamedSchedules(schedules: Schedules | undefined): Schedule[];
export function getNamedSchedules(
  schedules: VercelJsonSchedules | undefined
): VercelJsonSchedule[];
export function getNamedSchedules(
  schedules: Record<string, object> | undefined
): ({ name: string } & object)[] {
  return Object.entries(schedules ?? {}).map(([name, schedule]) => ({
    name,
    ...schedule,
  }));
}

/** Named schedules keyed by name, for `schedules` in Build Output. */
export function toScheduleRecord(schedules: readonly Schedule[]): Schedules;
export function toScheduleRecord(
  schedules: readonly VercelJsonSchedule[]
): VercelJsonSchedules;
export function toScheduleRecord(
  schedules: readonly ({ name: string } & object)[]
): Record<string, object> {
  return Object.fromEntries(
    schedules.map(({ name, ...schedule }) => [name, schedule])
  );
}
