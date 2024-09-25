import { frameworkList } from '@vercel/frameworks';

export function sortBuilders<B extends { use: string }>(builds: B[]): B[] {
  const frontendRuntimeSet = new Set(
    frameworkList.map(f => f.useRuntime?.use || '@vercel/static-build')
  );
  // `@vercel/python` is a special case for the "fasthtml" preset.
  // Delete it from the frontend set, and then special case it below
  // so that it is treated as "middle" priority in the sort.
  frontendRuntimeSet.delete('@vercel/python');
  const toNumber = (build: B) =>
    build.use === '@vercel/python'
      ? 1
      : frontendRuntimeSet.has(build.use)
        ? 0
        : 2;
  return builds.sort((build1, build2) => {
    return toNumber(build1) - toNumber(build2);
  });
}
