/**
 * Build log steps the build container splits a deployment's build log into.
 * Vercel CLI and its builders mark where installing dependencies and building
 * start; the build container marks the rest (clone, deploy, cache).
 */
export type BuildStep = 'INSTALLING_DEPENDENCIES' | 'BUILDING';

/**
 * Prints a `[vc:step:<STEP>]` line when the build container asks for step
 * markers with `VERCEL_BUILD_STEP_MARKERS=1`. The build container turns the
 * line into a delimiter in the build log and never shows it. Elsewhere, such
 * as a local `vercel build`, nothing is printed.
 *
 * The format must stay in sync with `STEP_MARKER_LINE` in the build
 * container's logging (vercel/api).
 */
export function markBuildStep(
  step: BuildStep,
  stream?: NodeJS.WritableStream
): void {
  if (process.env.VERCEL_BUILD_STEP_MARKERS !== '1') {
    return;
  }
  const line = `[vc:step:${step}]`;
  if (stream) {
    stream.write(`${line}\n`);
  } else {
    console.log(line);
  }
}
