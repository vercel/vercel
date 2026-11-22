import {
  NowBuildError,
  type VercelJsonSchedule,
  toScheduleRecord,
} from '@vercel/build-utils';
import type { StaticScheduleInput } from '@vercel-internals/local-schedules';
import { validateConfig } from '../validate-config';
import type { DevFunctionRegistry } from './function-registry';
import { dev } from './diagnostics';

export function collectStaticSchedules(
  authored: readonly VercelJsonSchedule[],
  registry: DevFunctionRegistry
): StaticScheduleInput[] {
  const schedules = [...authored, ...registry.schedules];
  // Validate the combined snapshot, including the BOA count limit. A name
  // defined twice is left to the schedule broker, which rejects it.
  const error = validateConfig({ schedules: toScheduleRecord(schedules) });
  if (error) throw error;
  // The authored schema accepts entrypoints, but native BOA must be resolved.
  for (const schedule of registry.schedules) {
    if ('entrypoint' in schedule) {
      throw new NowBuildError({
        code: 'DEV_SCHEDULE_MANIFEST_ENTRYPOINT',
        message: `Native schedule "${schedule.name}" has an unresolved entrypoint. The builder's getDevManifest must return a Build Output API function or topic instead.`,
      });
    }
  }
  // Provider/source ordering is not a definition change.
  schedules.sort((a, b) => a.name.localeCompare(b.name));

  return schedules.map(schedule => {
    const { name, timezone, jitter } = schedule;
    if ('entrypoint' in schedule) {
      // Entrypoints are planned into functions before discovery. Projects
      // whose builds belong to the services orchestrator are not planned.
      throw new NowBuildError({
        code: 'DEV_SCHEDULE_ENTRYPOINT_UNSUPPORTED',
        message: `Schedule "${name}" targets entrypoint "${schedule.entrypoint}", which vercel dev cannot resolve in a services project yet. Use function with an exact registered build output ID and a sole schedule/v1beta trigger, or topic for a queue.`,
      });
    }
    if ('function' in schedule) {
      if (schedule.service !== undefined) {
        throw new NowBuildError({
          code: 'DEV_SCHEDULE_SERVICE_FUNCTION_UNSUPPORTED',
          message: `Schedule "${name}" targets function "${schedule.function}" in service "${schedule.service}", which vercel dev does not support yet. Service-hosted schedule targets run once deployed.`,
        });
      }
      const fn = registry.functions.get(schedule.function);
      if (!fn) {
        throw dev.DEV_SCHEDULE_FUNCTION_MISSING({
          name,
          outputPath: schedule.function,
        });
      }
      if (
        fn.experimentalTriggers?.length !== 1 ||
        fn.experimentalTriggers[0]?.type !== 'schedule/v1beta'
      ) {
        throw dev.DEV_SCHEDULE_FUNCTION_TRIGGER({
          name,
          outputPath: schedule.function,
        });
      }
    }
    return {
      name,
      expression: { type: 'cron', cron: schedule.schedule },
      jitter,
      timezone,
      target:
        'function' in schedule
          ? { type: 'function', function: schedule.function }
          : 'path' in schedule
            ? {
                type: 'path',
                path: schedule.path,
                ...(schedule.requestMethod !== undefined && {
                  requestMethod: schedule.requestMethod,
                }),
              }
            : { type: 'queue', topic: schedule.topic },
    };
  });
}
