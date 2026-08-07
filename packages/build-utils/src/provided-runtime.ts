/**
 * The Lambda runtime that custom runtimes must target.
 *
 * Builds run on Amazon Linux 2023, so this is a constant. It is deliberately
 * not derived from the build host's `/etc/os-release`: `vercel build` also runs
 * on developer machines and in CI, and the emitted runtime has to match the
 * deploy target rather than wherever the build happened to run.
 *
 * This stays a function so that custom runtimes pick up any future base image
 * migration without having to change their own code.
 */
export async function getProvidedRuntime(): Promise<'provided.al2023'> {
  return 'provided.al2023';
}
