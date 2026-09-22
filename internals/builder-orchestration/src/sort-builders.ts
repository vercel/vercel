import { frameworkList } from '@vercel/frameworks';

export function sortBuilders<B extends { use: string }>(builds: B[]): B[] {
  const frameworkRuntimeSet = new Set(
    frameworkList.map(f => f.useRuntime?.use || '@vercel/static-build')
  );
  // runtime builders, e.g. `@vercel/python`, `@vercel/ruby`, are special cases
  // for runtime framework presets.
  // Delete them from the frontend set, and then special case them below
  // so that they are treated as "middle" priority in the sort.
  frameworkRuntimeSet.delete('@vercel/go');
  frameworkRuntimeSet.delete('@vercel/python');
  frameworkRuntimeSet.delete('@vercel/ruby');
  frameworkRuntimeSet.delete('@vercel/rust');
  const toNumber = (build: B) =>
    build.use === '@vercel/go' ||
    build.use === '@vercel/python' ||
    build.use === '@vercel/ruby' ||
    build.use === '@vercel/rust'
      ? 1
      : frameworkRuntimeSet.has(build.use)
        ? 0
        : 2;
  return builds.sort((build1, build2) => {
    return toNumber(build1) - toNumber(build2);
  });
}
