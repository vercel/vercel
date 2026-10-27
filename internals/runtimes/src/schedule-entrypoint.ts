import { createHash } from 'crypto';
import {
  type Builder,
  type BuilderFunctions,
  type Schedule,
  type ScheduleFunctionBuildConfig,
  type VercelJsonSchedule,
  NowBuildError,
  findMatchingFunction,
  getScheduleFunctionPath,
  normalizePath,
} from '@vercel/build-utils';
import {
  type ParsedScheduleEntrypoint,
  SCHEDULE_ENTRYPOINT_FORMS_HINT,
  parseScheduleEntrypoint,
} from './entrypoint';
import { inferServerRuntimeFromFramework } from './framework';

/**
 * How a schedule entrypoint is packed into a function.
 *
 * - `dedicated`: the entrypoint gets its own function at `outputPath`.
 * - `shared`: entrypoints with the same `configKey` share one function. The
 *   key is the entrypoint's effective `functions` config, so entrypoints only
 *   split into separate functions when their configs differ. `pattern` is the
 *   `functions` key the config came from, which names the function; it is
 *   absent when the entrypoint has no config.
 */
export type ScheduleFunctionPacking =
  | { mode: 'dedicated'; outputPath: string }
  | { mode: 'shared'; configKey: string; pattern?: string };

/**
 * A schedule entrypoint lowered to what build orchestration needs before any
 * builder runs: which builder owns it, which source files it claims, and how
 * it is packed into a function.
 */
export interface ResolvedScheduleEntrypoint {
  entrypoint: string;
  use: string;
  /**
   * Project-relative source files no other builder may claim. The first is
   * the file the builder is invoked with.
   */
  sourceFiles: [string, ...string[]];
  packing: ScheduleFunctionPacking;
}

export type ScheduleEntrypointResolution =
  | { ok: true; resolved: ResolvedScheduleEntrypoint }
  | {
      ok: false;
      code:
        | 'INVALID_SCHEDULE_ENTRYPOINT'
        | 'UNSUPPORTED_SCHEDULE_ENTRYPOINT_RUNTIME'
        | 'SCHEDULE_ENTRYPOINT_NOT_FOUND'
        | 'SCHEDULE_ENTRYPOINT_RUNTIME_MISMATCH'
        | 'SCHEDULE_ENTRYPOINT_TRIGGER_CONFLICT';
      /** Sentence fragment; callers prefix the schedule name. */
      message: string;
    };

/** Stable JSON: object keys sorted, `undefined` values dropped. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** A `configKey` for an entrypoint without `functions` config. */
const NO_CONFIG_KEY = '{}';

type FunctionMatch = ReturnType<typeof findMatchingFunction>;

/**
 * Whether `experimentalTriggers` can apply to a schedule entrypoint: absent,
 * or exactly the schedule trigger. Same rule as `getLambdaOptionsFromFunction`
 * in `@vercel/build-utils`, which then forces that trigger.
 */
function isScheduleTrigger(
  triggers: NonNullable<FunctionMatch>['functionConfig']['experimentalTriggers']
): boolean {
  return (
    triggers === undefined ||
    (triggers.length === 1 && triggers[0]?.type === 'schedule/v1beta')
  );
}

/**
 * The `functions` config a Python entrypoint builds with, as a grouping key,
 * and the pattern it came from. An empty entry is the same as no entry.
 *
 * `experimentalTriggers` is left out of the key: every entrypoint was checked
 * by `isScheduleTrigger`, so they all get the same forced trigger. Once there
 * is more than one schedule trigger version, the resolved trigger has to be
 * part of the key, because a function receives one dispatch format.
 */
function getPythonPacking(
  match: FunctionMatch
): Extract<ScheduleFunctionPacking, { mode: 'shared' }> {
  const configKey = stableStringify({
    ...match?.functionConfig,
    experimentalTriggers: undefined,
  });
  return configKey === NO_CONFIG_KEY || !match
    ? { mode: 'shared', configKey }
    : { mode: 'shared', configKey, pattern: match.pattern };
}

/**
 * A Python entrypoint is a script run per firing. Entrypoints with the same
 * `functions` config share one function, because each Python function carries
 * the project's full dependency install.
 */
function resolvePython(
  entrypoint: string,
  parsed: Extract<ParsedScheduleEntrypoint, { runtime: 'python' }>,
  files: readonly string[],
  functions: BuilderFunctions | undefined
): ScheduleEntrypointResolution {
  const sourceFile = parsed.filePath;
  if (!files.includes(sourceFile)) {
    return {
      ok: false,
      code: 'SCHEDULE_ENTRYPOINT_NOT_FOUND',
      message: `entrypoint "${entrypoint}" resolves to missing file "${sourceFile}".`,
    };
  }
  // Keys match the full path, like every other runtime. Keep in sync with
  // `getMatchingFunction` in `@vercel/python` for schedule entrypoints.
  const match = findMatchingFunction(functions, [sourceFile]);
  // Checked for every entrypoint here: the builder only checks the config of
  // the first entrypoint in a shared function.
  if (match && !isScheduleTrigger(match.functionConfig.experimentalTriggers)) {
    return {
      ok: false,
      code: 'SCHEDULE_ENTRYPOINT_TRIGGER_CONFLICT',
      message:
        `entrypoint "${entrypoint}" matches "functions" pattern ` +
        `"${match.pattern}", whose "experimentalTriggers" conflict with the ` +
        'schedule trigger. Remove "experimentalTriggers" or set it to ' +
        '[{ "type": "schedule/v1beta" }].',
    };
  }
  return {
    ok: true,
    resolved: {
      entrypoint,
      use: '@vercel/python',
      sourceFiles: [sourceFile],
      packing: getPythonPacking(match),
    },
  };
}

/**
 * Resolve a schedule entrypoint against the project file list. Pure: no
 * filesystem access, no package discovery. Anything that needs either belongs
 * in the owning builder.
 *
 * Adding a runtime means adding a case to the switch below.
 */
export function resolveScheduleEntrypoint(
  entrypoint: string,
  files: readonly string[],
  framework?: string | null,
  functions?: BuilderFunctions
): ScheduleEntrypointResolution {
  const parsed = parseScheduleEntrypoint(entrypoint);
  if (!parsed) {
    return {
      ok: false,
      code: 'INVALID_SCHEDULE_ENTRYPOINT',
      message: `has invalid entrypoint "${entrypoint}". ${SCHEDULE_ENTRYPOINT_FORMS_HINT}`,
    };
  }

  // A framework that owns a server runtime (Next.js, FastAPI, Express) only
  // accepts entrypoints in that runtime. Static frontends and `framework:
  // null` accept any supported runtime, the same way `api/` does today.
  const frameworkRuntime = inferServerRuntimeFromFramework(framework);
  if (frameworkRuntime && parsed.runtime !== frameworkRuntime) {
    return {
      ok: false,
      code: 'SCHEDULE_ENTRYPOINT_RUNTIME_MISMATCH',
      message:
        `entrypoint "${entrypoint}" uses the ${parsed.runtime} runtime, but ` +
        `framework "${framework}" uses the ${frameworkRuntime} runtime. ` +
        'Schedule entrypoints must use the same runtime as the framework.',
    };
  }

  switch (parsed.runtime) {
    case 'python':
      return resolvePython(entrypoint, parsed, files, functions);
    case 'node':
      return {
        ok: false,
        code: 'UNSUPPORTED_SCHEDULE_ENTRYPOINT_RUNTIME',
        message:
          `entrypoint "${entrypoint}" uses an unsupported runtime. ` +
          'JavaScript and TypeScript schedule entrypoints are not supported yet.',
      };
  }
}

/** A resolved entrypoint together with the schedules that target it. */
export interface ScheduleEntrypointUse {
  resolved: ResolvedScheduleEntrypoint;
  /** Schedule names in `vercel.json` order. */
  scheduleNames: string[];
}

/** One schedule function build: the builder and what it must produce. */
export interface PlannedScheduleFunction {
  use: string;
  config: ScheduleFunctionBuildConfig;
}

/** Longest last segment of a shared function's name before it is cut. */
const MAX_FUNCTION_NAME_LENGTH = 64;
/** Patterns named in a shared function's name before the rest are counted. */
const MAX_NAMED_PATTERNS = 3;

/**
 * Path segments for a `functions` pattern: `.py` dropped, and characters that
 * are not safe in a file name, such as glob syntax, replaced with `_`.
 */
function getPatternSegments(pattern: string): string[] {
  const segments = pattern
    .replace(/\.py$/, '')
    .split('/')
    .filter(segment => segment !== '' && segment !== '.')
    .map(segment =>
      segment === '..' ? '_' : segment.replace(/[^A-Za-z0-9._-]/g, '_')
    );
  return segments.length > 0 ? segments : ['_'];
}

/**
 * Name of a shared function, from the `functions` patterns its entrypoints'
 * config came from, in `vercel.json` schedule order.
 *
 * - No pattern: `default`.
 * - One pattern: the pattern, e.g. `jobs/report`.
 * - Several: their shared directory, then the rest joined with `+`, e.g.
 *   `jobs/report+cleanup`. Past three patterns the rest are counted.
 * - A last segment over 64 characters is cut and suffixed with a hash of the
 *   full pattern list, so two cut names cannot collide.
 */
function getSharedScheduleFunctionSegments(
  patterns: readonly string[]
): string[] {
  if (patterns.length === 0) return ['default'];

  const all = patterns.map(getPatternSegments);
  // Shared leading directories. Every pattern keeps at least its last
  // segment, so a single pattern keeps all of its directories.
  const [head = []] = all;
  const prefix: string[] = [];
  for (const [i, segment] of head.slice(0, -1).entries()) {
    if (!all.every(s => s.length > i + 1 && s[i] === segment)) break;
    prefix.push(segment);
  }
  const rests = all.map(s => s.slice(prefix.length).join('_'));
  let name = rests.slice(0, MAX_NAMED_PATTERNS).join('+');
  if (rests.length > MAX_NAMED_PATTERNS) {
    name += `+${rests.length - MAX_NAMED_PATTERNS}-more`;
  }
  if (name.length > MAX_FUNCTION_NAME_LENGTH) {
    const hash = createHash('sha256')
      .update(patterns.join('\0'))
      .digest('hex')
      .slice(0, 6);
    name = `${name.slice(0, MAX_FUNCTION_NAME_LENGTH - hash.length - 1)}-${hash}`;
  }
  return [...prefix, name];
}

interface PlannedGroup {
  use: string;
  shared: boolean;
  /** Set for dedicated entrypoints; shared groups are named after grouping. */
  outputPath?: string;
  /** `functions` patterns the group's config came from, in first-use order. */
  patterns: string[];
  entrypoints: ScheduleFunctionBuildConfig['entrypoints'];
}

/**
 * Pack resolved schedule entrypoints into function builds. `dedicated`
 * entrypoints get one function each. `shared` entrypoints with the same
 * builder and config key share one function, which dispatches on the
 * schedule name, so a schedule name may appear only once in it.
 */
export function planScheduleFunctions(uses: Iterable<ScheduleEntrypointUse>):
  | { ok: true; functions: PlannedScheduleFunction[] }
  | {
      ok: false;
      code:
        | 'SCHEDULE_ENTRYPOINT_OUTPUT_COLLISION'
        | 'SCHEDULE_FUNCTION_NAME_COLLISION'
        | 'SCHEDULE_NAME_COLLISION';
      message: string;
    } {
  // Group first, so a shared function is named after all of its patterns.
  const groups: PlannedGroup[] = [];
  const sharedGroups = new Map<string, PlannedGroup>();
  for (const { resolved, scheduleNames } of uses) {
    const { packing } = resolved;
    const entrypoint = {
      entrypoint: resolved.entrypoint,
      sourceFile: resolved.sourceFiles[0],
      scheduleNames,
    };
    if (packing.mode === 'dedicated') {
      groups.push({
        use: resolved.use,
        shared: false,
        outputPath: packing.outputPath,
        patterns: [],
        entrypoints: [entrypoint],
      });
      continue;
    }
    const key = `${resolved.use}\0${packing.configKey}`;
    let group = sharedGroups.get(key);
    if (group) {
      group.entrypoints.push(entrypoint);
    } else {
      group = {
        use: resolved.use,
        shared: true,
        patterns: [],
        entrypoints: [entrypoint],
      };
      sharedGroups.set(key, group);
      groups.push(group);
    }
    if (
      packing.pattern !== undefined &&
      !group.patterns.includes(packing.pattern)
    ) {
      group.patterns.push(packing.pattern);
    }
  }

  const functions: PlannedScheduleFunction[] = [];
  // Compared case-insensitively: case-insensitive file systems would put two
  // functions that differ only in case in the same directory.
  const groupByOutputPath = new Map<string, PlannedGroup>();
  for (const group of groups) {
    const outputPath =
      group.outputPath ??
      getScheduleFunctionPath(
        getSharedScheduleFunctionSegments(group.patterns)
      );
    const first = group.entrypoints[0].entrypoint;

    const existing = groupByOutputPath.get(outputPath.toLowerCase());
    if (existing) {
      const other = existing.entrypoints[0].entrypoint;
      return existing.shared && group.shared
        ? {
            ok: false,
            code: 'SCHEDULE_FUNCTION_NAME_COLLISION',
            message:
              `Schedule entrypoints "${other}" and "${first}" have different ` +
              `"functions" config but would both build into "${outputPath}". ` +
              'Rename one of their "functions" patterns.',
          }
        : {
            ok: false,
            code: 'SCHEDULE_ENTRYPOINT_OUTPUT_COLLISION',
            message:
              `Schedule entrypoints "${other}" and "${first}" resolve to the ` +
              `same function output "${outputPath}".`,
          };
    }
    groupByOutputPath.set(outputPath.toLowerCase(), group);

    const scripts = new Map<string, string>();
    for (const { entrypoint, scheduleNames } of group.entrypoints) {
      for (const name of scheduleNames) {
        const other = scripts.get(name);
        if (other !== undefined && other !== entrypoint) {
          return {
            ok: false,
            code: 'SCHEDULE_NAME_COLLISION',
            message:
              `Schedule name "${name}" is used by entrypoints "${other}" and ` +
              `"${entrypoint}", which build into the same function ` +
              `"${outputPath}". Schedule names must be unique.`,
          };
        }
        scripts.set(name, entrypoint);
      }
    }

    functions.push({
      use: group.use,
      config: { outputPath, entrypoints: group.entrypoints },
    });
  }
  return { ok: true, functions };
}

/**
 * Check all schedule entrypoint runtimes before resolving individual entrypoints.
 * Invalid forms are left to the per-entrypoint resolver for its existing error.
 */
export function validateScheduleEntrypointRuntimes(
  schedules: readonly { name: string; entrypoint: string }[]
):
  | { ok: true }
  | {
      ok: false;
      code: 'MIXED_SCHEDULE_ENTRYPOINT_RUNTIMES';
      message: string;
    } {
  let first: { name: string; entrypoint: string; runtime: string } | undefined;
  for (const { name, entrypoint } of schedules) {
    const parsed = parseScheduleEntrypoint(entrypoint);
    if (!parsed) continue;
    if (first && first.runtime !== parsed.runtime) {
      return {
        ok: false,
        code: 'MIXED_SCHEDULE_ENTRYPOINT_RUNTIMES',
        message:
          `Schedule "${first.name}" entrypoint "${first.entrypoint}" uses the ${first.runtime} runtime, ` +
          `but schedule "${name}" entrypoint "${entrypoint}" uses the ${parsed.runtime} runtime. ` +
          'Schedule entrypoints must all use the same runtime.',
      };
    }
    first ??= { name, entrypoint, runtime: parsed.runtime };
  }
  return { ok: true };
}

export function hasScheduleEntrypointTarget(
  schedule: VercelJsonSchedule
): schedule is Extract<VercelJsonSchedule, { entrypoint: string }> {
  return 'entrypoint' in schedule;
}

/** Schedule entrypoints lowered to the builds `vercel build` and `vercel dev` run. */
export interface ScheduleEntrypointPlan {
  uses: ScheduleEntrypointUse[];
  /** One build per planned function. */
  builds: Builder[];
  /** Source files no other builder may claim. */
  reservedFunctionFiles: string[];
  /** Function output path for each entrypoint. */
  outputPaths: Map<string, string>;
}

/**
 * Resolve and pack every schedule entrypoint in `vercel.json` order. Throws a
 * `NowBuildError` with the code of the first check that fails.
 */
export function planScheduleEntrypoints({
  schedules = [],
  files,
  framework,
  functions,
}: {
  schedules?: readonly VercelJsonSchedule[];
  files: readonly string[];
  framework?: string | null;
  functions?: BuilderFunctions;
}): ScheduleEntrypointPlan {
  const targets = schedules
    .filter(hasScheduleEntrypointTarget)
    .map(schedule => ({
      name: schedule.name,
      entrypoint: schedule.entrypoint,
    }));

  const runtimeCheck = validateScheduleEntrypointRuntimes(targets);
  if (!runtimeCheck.ok) {
    const { code, message } = runtimeCheck;
    throw new NowBuildError({ code, message });
  }

  const uses = new Map<string, ScheduleEntrypointUse>();
  for (const { name, entrypoint } of targets) {
    const existing = uses.get(entrypoint);
    if (existing) {
      existing.scheduleNames.push(name);
      continue;
    }
    const resolution = resolveScheduleEntrypoint(
      entrypoint,
      files,
      framework,
      functions
    );
    if (!resolution.ok) {
      throw new NowBuildError({
        code: resolution.code,
        message: `Schedule "${name}" ${resolution.message}`,
      });
    }
    uses.set(entrypoint, {
      resolved: resolution.resolved,
      scheduleNames: [name],
    });
  }

  const plan = planScheduleFunctions(uses.values());
  if (!plan.ok) {
    const { code, message } = plan;
    throw new NowBuildError({ code, message });
  }

  const outputPaths = new Map<string, string>();
  for (const { config } of plan.functions) {
    for (const { entrypoint } of config.entrypoints) {
      outputPaths.set(entrypoint, config.outputPath);
    }
  }
  return {
    uses: [...uses.values()],
    // The builder receives the entrypoints it serves and the output path it
    // must produce.
    builds: plan.functions.map(({ use, config }) => ({
      src: config.entrypoints[0].sourceFile,
      use,
      config: {
        zeroConfig: true,
        ...(functions ? { functions } : undefined),
        scheduleFunction: config,
      },
    })),
    reservedFunctionFiles: [...uses.values()].flatMap(
      ({ resolved }) => resolved.sourceFiles
    ),
    outputPaths,
  };
}

/** Reject another build whose `src` is a schedule entrypoint's source file. */
export function assertNoScheduleEntrypointSourceConflict(
  builds: readonly Builder[],
  plan: ScheduleEntrypointPlan
): void {
  const entrypoints = new Map<string, string>();
  for (const { resolved } of plan.uses) {
    for (const sourceFile of resolved.sourceFiles) {
      entrypoints.set(sourceFile, resolved.entrypoint);
    }
  }
  for (const build of builds) {
    if (typeof build.src !== 'string') continue;
    const sourcePath = normalizePath(build.src).replace(/^\.\//, '');
    const entrypoint = entrypoints.get(sourcePath);
    if (entrypoint === undefined) continue;
    throw new NowBuildError({
      code: 'SCHEDULE_ENTRYPOINT_SOURCE_CONFLICT',
      message:
        `Schedule entrypoint "${entrypoint}" uses source file ` +
        `"${sourcePath}", which is also matched by builder "${build.use}". ` +
        'Move the schedule entrypoint to its own file or remove the conflicting build.',
    });
  }
}

/**
 * Replace each `entrypoint` with the function it builds into. Entrypoint
 * schedules keep their name, defaulted if unset: the built function dispatches
 * on it, and the API would derive a different one from the `function` target.
 */
export function resolveScheduleEntrypointTargets(
  schedules: readonly VercelJsonSchedule[],
  plan: ScheduleEntrypointPlan
): Schedule[] {
  return schedules.map(schedule => {
    if (!hasScheduleEntrypointTarget(schedule)) return schedule;
    const { entrypoint, ...rest } = schedule;
    const outputPath = plan.outputPaths.get(entrypoint);
    if (!outputPath) {
      throw new Error(
        `Missing build output for schedule entrypoint "${entrypoint}"`
      );
    }
    return { ...rest, function: outputPath };
  });
}
