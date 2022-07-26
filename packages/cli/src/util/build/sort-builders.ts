import { frameworks } from '@vercel/frameworks';

export function sortBuilders<B extends { use: string }>(builds: B[]): B[] {
  const frontendRuntimeSet = new Set(
    frameworks.map(f => (f as any).useRuntime?.use || '@vercel/static-build')
  );
  const toNumber = (build: B) => (frontendRuntimeSet.has(build.use) ? 0 : 1);

  return builds.sort((build1, build2) => {
    return toNumber(build1) - toNumber(build2);
  });
}
