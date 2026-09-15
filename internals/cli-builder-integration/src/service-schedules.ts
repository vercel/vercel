const DYNAMIC_SCHEDULE = '<dynamic>';

export function getStaticServiceSchedules(
  schedule: string | string[] | undefined
): string[] {
  if (!schedule || schedule === DYNAMIC_SCHEDULE) {
    return [];
  }

  return Array.isArray(schedule)
    ? schedule.filter(item => item !== DYNAMIC_SCHEDULE)
    : [schedule];
}
