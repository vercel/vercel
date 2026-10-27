import type { ScheduleFunctionBuildConfig } from '@vercel/build-utils';

/**
 * Generated supervisor module for a schedule function. Lives under a reserved
 * directory named after the function's output path so two functions built from
 * the same project never share a module.
 */
export function getGeneratedScheduleHandlerPath(outputPath: string): string {
  return `_vc_schedule_handlers/${outputPath.replace(/[^A-Za-z0-9]+/g, '_')}.py`;
}

/**
 * Source for the supervisor module. Each firing runs the script for the
 * dispatched schedule name. Script paths are relative to `rootDir`, or to the
 * function root when the module is deployed at its generated path.
 */
export function createScheduleHandlerModule(
  { entrypoints }: ScheduleFunctionBuildConfig,
  rootDir?: string
): string {
  const entries = entrypoints.flatMap(({ sourceFile, scheduleNames }) =>
    scheduleNames.map(
      name =>
        `    ${JSON.stringify(name)}: os.path.join(_root, ${JSON.stringify(sourceFile)}),`
    )
  );
  return [
    'import os.path',
    '',
    'from vercel_runtime.schedules import create_schedule_scripts_app',
    '',
    rootDir === undefined
      ? '_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))'
      : `_root = ${JSON.stringify(rootDir)}`,
    'app = create_schedule_scripts_app({',
    ...entries,
    '})',
    '',
  ].join('\n');
}
